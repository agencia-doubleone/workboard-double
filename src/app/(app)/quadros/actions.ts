"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { whiteboard, whiteboardMember } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { getSession } from "@/lib/session";
import {
  createWhiteboardSchema,
  elementChangesSchema,
  elementSchema,
  saveElementsSchema,
  savePreviewSchema,
  updateWhiteboardSchema,
  whiteboardTargetSchema,
  type CreateWhiteboardInput,
  type SaveElementsInput,
  type UpdateWhiteboardInput,
} from "@/lib/validations/whiteboards";
import { isStickyElement, WHITEBOARD_ACCESS, type StoredElement, type WhiteboardAccess } from "@/lib/whiteboards";
import { achievementsAfter, onStickiesCreated, onWhiteboardSaved } from "@/server/achievements";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { filterActiveUserIds } from "@/server/jobs";
import { notifyWhiteboardShared } from "@/server/notify";
import { closeBoardRoomAfter, createBoardTicket } from "@/server/realtime";
import {
  canLinkJob,
  canManageWhiteboard,
  findAccessibleWhiteboard,
  findSavedElementIds,
  listWhiteboardChanges,
  saveWhiteboardElements,
  saveWhiteboardPreview,
  type FoundWhiteboard,
} from "@/server/whiteboards";

// Quadros brancos. Quem acessa edita o desenho; quem gerencia (o dono e, nos
// coletivos, os admins) muda nome, acesso e vínculo e exclui. Na auditoria
// entram criação, edição e exclusão; o desenho não (é o dia a dia). Criar
// quadros e post-its conta para as conquistas.

export type WhiteboardActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const NOT_FOUND = { ok: false, error: "Quadro não encontrado." } as const;

async function getContext() {
  const session = await getSession();
  if (!session) return null;
  const isAdmin = session.user.role === "admin";
  return {
    actor: session.user,
    isAdmin,
    viewer: { id: session.user.id, isAdmin },
  };
}

function invalid(error: z.ZodError): WhiteboardActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function entityOf(board: { id: string; title: string }) {
  return { type: "whiteboard" as const, id: board.id, label: board.title };
}

/** Só "pessoas escolhidas" guarda pessoas; o dono não precisa estar na lista. */
async function resolveMembers(access: WhiteboardAccess, memberIds: string[], ownerId: string | null) {
  if (access !== "members") return [];
  return filterActiveUserIds(
    db,
    memberIds.filter((id) => id !== ownerId),
  );
}

export async function createWhiteboard(input: CreateWhiteboardInput): Promise<WhiteboardActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = createWhiteboardSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const linkedJob = data.jobId ? await canLinkJob(db, data.jobId, ctx.viewer) : null;
  if (data.jobId && !linkedJob) {
    return { ok: false, error: "Trabalho inválido.", fieldErrors: { jobId: ["Escolha um trabalho seu."] } };
  }
  const memberIds = await resolveMembers(data.access, data.memberIds, ctx.actor.id);
  const id = randomUUID();
  await db.batch([
    db.insert(whiteboard).values({
      id,
      title: data.title,
      access: data.access,
      jobId: linkedJob?.id ?? null,
      ownerId: ctx.actor.id,
      contentUpdatedById: ctx.actor.id,
    }),
    ...(memberIds.length ? [db.insert(whiteboardMember).values(memberIds.map((userId) => ({ whiteboardId: id, userId })))] : []),
  ]);

  await recordAudit({
    action: "whiteboard.created",
    actor: ctx.actor,
    entity: entityOf({ id, title: data.title }),
    metadata: {
      access: WHITEBOARD_ACCESS[data.access].label,
      members: memberIds.length,
      ...(linkedJob ? { job: `#${linkedJob.pit} ${linkedJob.name}` } : {}),
    },
    ...getRequestMeta(await headers()),
  });
  notifyWhiteboardShared({ board: { id, title: data.title }, actor: ctx.actor, userIds: memberIds });
  achievementsAfter("quadro criado", (database) =>
    onWhiteboardSaved(database, { userId: ctx.actor.id, created: true, team: data.access === "team" }),
  );
  return { ok: true, message: "Quadro criado.", id };
}

/** O quadro, se a pessoa puder gerenciá-lo (o dono; nos coletivos, também os admins). */
async function findManageable(ctx: NonNullable<Awaited<ReturnType<typeof getContext>>>, whiteboardId: string) {
  const found = await findAccessibleWhiteboard(db, whiteboardId, ctx.viewer);
  if (!found) return { found: null, error: NOT_FOUND };
  if (!canManageWhiteboard(found, ctx.viewer)) {
    return { found: null, error: { ok: false, error: "Só quem criou o quadro (ou um admin) pode mudar isso." } as const };
  }
  return { found, error: null };
}

function jobLabel(found: Pick<FoundWhiteboard, "job">) {
  return found.job ? `#${found.job.pit} ${found.job.name}` : null;
}

export async function updateWhiteboard(input: UpdateWhiteboardInput): Promise<WhiteboardActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = updateWhiteboardSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const { found, error } = await findManageable(ctx, data.whiteboardId);
  if (!found) return error;
  const { board } = found;
  // Quadro pessoal é só do dono: um admin não o vê, então não chega aqui.
  if (data.access === "private" && board.ownerId !== ctx.actor.id) {
    return { ok: false, error: "Só quem criou pode tornar o quadro pessoal.", fieldErrors: { access: ["Escolha outro acesso."] } };
  }

  let linkedJob = found.job;
  if (data.jobId !== board.jobId) {
    linkedJob = data.jobId ? await canLinkJob(db, data.jobId, ctx.viewer) : null;
    if (data.jobId && !linkedJob) {
      return { ok: false, error: "Trabalho inválido.", fieldErrors: { jobId: ["Escolha um trabalho seu."] } };
    }
  }

  const before = new Set(found.members.map((member) => member.id));
  const memberIds = await resolveMembers(data.access, data.memberIds, board.ownerId);
  const after = new Set(memberIds);
  const added = memberIds.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));

  await db.batch([
    db
      .update(whiteboard)
      .set({ title: data.title, access: data.access, jobId: linkedJob?.id ?? null })
      .where(eq(whiteboard.id, board.id)),
    ...(removed.length
      ? [
          db
            .delete(whiteboardMember)
            .where(and(eq(whiteboardMember.whiteboardId, board.id), inArray(whiteboardMember.userId, removed))),
        ]
      : []),
    ...(added.length
      ? [db.insert(whiteboardMember).values(added.map((userId) => ({ whiteboardId: board.id, userId }))).onConflictDoNothing()]
      : []),
  ]);

  const changes: AuditChanges = {};
  if (data.title !== board.title) changes.title = { from: board.title, to: data.title };
  if (data.access !== board.access) {
    changes.access = { from: WHITEBOARD_ACCESS[board.access].label, to: WHITEBOARD_ACCESS[data.access].label };
  }
  if ((linkedJob?.id ?? null) !== board.jobId) {
    changes.job = { from: jobLabel(found), to: linkedJob ? `#${linkedJob.pit} ${linkedJob.name}` : null };
  }
  if (added.length || removed.length) changes.whiteboardMembers = { from: before.size, to: after.size };
  if (Object.keys(changes).length > 0) {
    await recordAudit({
      action: "whiteboard.updated",
      actor: ctx.actor,
      entity: entityOf({ id: board.id, title: data.title }),
      metadata: { changes },
      ...getRequestMeta(await headers()),
    });
  }
  // Quem acessa pode ter mudado: a sala fecha e cada um volta se ainda puder.
  if (changes.access || changes.job || removed.length) closeBoardRoomAfter(board.id);
  notifyWhiteboardShared({ board: { id: board.id, title: data.title }, actor: ctx.actor, userIds: added });
  if (data.access === "team" && board.access !== "team" && board.ownerId === ctx.actor.id) {
    achievementsAfter("quadro da equipe", (database) =>
      onWhiteboardSaved(database, { userId: ctx.actor.id, created: false, team: true }),
    );
  }
  refresh();
  return { ok: true, message: "Quadro atualizado." };
}

export async function deleteWhiteboard(input: { whiteboardId: string }): Promise<WhiteboardActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = whiteboardTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;

  const { found, error } = await findManageable(ctx, parsed.data.whiteboardId);
  if (!found) return error;
  // Os elementos, as pessoas e as notificações saem junto (cascade). As imagens
  // ficam no CDN: podem estar em outro quadro (copiar e colar); sem uso, a tela
  // de arquivos mostra e limpa.
  await db.delete(whiteboard).where(eq(whiteboard.id, found.board.id));
  await recordAudit({
    action: "whiteboard.deleted",
    actor: ctx.actor,
    entity: entityOf(found.board),
    metadata: { access: WHITEBOARD_ACCESS[found.board.access].label, ...(found.job ? { job: jobLabel(found) } : {}) },
    ...getRequestMeta(await headers()),
  });
  closeBoardRoomAfter(found.board.id);
  return { ok: true, message: "Quadro excluído." };
}

// Desenho (chamadas do próprio quadro, várias por minuto: sem auditoria nem refresh).

export type ElementsActionResult =
  | { ok: true; saved: number; skipped: number }
  | { ok: false; error: string; gone?: boolean };

export async function saveElements(input: SaveElementsInput): Promise<ElementsActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = saveElementsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Alguns elementos não puderam ser salvos." };
  const found = await findAccessibleWhiteboard(db, parsed.data.whiteboardId, ctx.viewer);
  if (!found) return { ok: false, error: "Você não tem mais acesso a este quadro.", gone: true };
  // Elemento fora do formato (tipo não aceito, grande demais) fica de fora; o resto grava.
  const elements = parsed.data.elements.flatMap((element) => {
    const result = elementSchema.safeParse(element);
    return result.success ? [result.data as StoredElement] : [];
  });
  // Post-its que ainda não estavam no banco foram criados agora por quem grava (conquista "Post-it Mania").
  const stickyIds = elements.filter((element) => !element.isDeleted && isStickyElement(element)).map((element) => element.id);
  const existing = await findSavedElementIds(db, found.board.id, stickyIds);
  const saved = elements.length
    ? await saveWhiteboardElements(db, { whiteboardId: found.board.id, elements, userId: ctx.actor.id })
    : 0;
  const newStickies = stickyIds.filter((id) => !existing.has(id));
  if (newStickies.length) {
    achievementsAfter("post-its", (database) =>
      onStickiesCreated(database, { userId: ctx.actor.id, whiteboardId: found.board.id, elementIds: newStickies }),
    );
  }
  return { ok: true, saved, skipped: parsed.data.elements.length - elements.length };
}

export type ChangesActionResult =
  | { ok: true; elements: StoredElement[]; cursor: string }
  | { ok: false; error: string; gone?: boolean };

/** O que mudou desde o cursor (sem tempo real, ou ao reconectar). */
export async function getElementChanges(input: { whiteboardId: string; cursor: string }): Promise<ChangesActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = elementChangesSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findAccessibleWhiteboard(db, parsed.data.whiteboardId, ctx.viewer);
  if (!found) return { ok: false, error: "Você não tem mais acesso a este quadro.", gone: true };
  const changes = await listWhiteboardChanges(db, found.board.id, new Date(parsed.data.cursor));
  return { ok: true, elements: changes.elements, cursor: changes.cursor.toISOString() };
}

export async function savePreview(input: { whiteboardId: string; dataUrl: string }): Promise<{ ok: boolean }> {
  const ctx = await getContext();
  if (!ctx) return { ok: false };
  const parsed = savePreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const found = await findAccessibleWhiteboard(db, parsed.data.whiteboardId, ctx.viewer);
  if (!found) return { ok: false };
  await saveWhiteboardPreview(db, found.board.id, parsed.data.dataUrl || null);
  return { ok: true };
}

export type TicketActionResult =
  | { ok: true; ticket: { url: string; token: string } | null }
  | { ok: false; error: string; gone?: boolean };

/** Entrada na sala ao vivo (null: tempo real não configurado). Confere o acesso a cada entrada. */
export async function getBoardTicket(input: { whiteboardId: string }): Promise<TicketActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = whiteboardTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findAccessibleWhiteboard(db, parsed.data.whiteboardId, ctx.viewer);
  if (!found) return { ok: false, error: "Você não tem mais acesso a este quadro.", gone: true };
  const ticket = await createBoardTicket({ userId: ctx.actor.id, boardId: found.board.id, name: ctx.actor.name });
  return { ok: true, ticket };
}
