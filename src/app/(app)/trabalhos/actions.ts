"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { job, jobAssignee, jobMessage, jobMessageAttachment, jobStatusHistory, user } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { requestCode } from "@/lib/client-requests";
import { extractMentions, isJobCompletion, positionBetween } from "@/lib/jobs";
import { normalizeMessageBody, PINNED_MESSAGES_MAX, toReactionViews, type MessageUpdateResult } from "@/lib/messages";
import { getSession } from "@/lib/session";
import {
  createJobSchema,
  jobTargetSchema,
  messageTargetSchema,
  moveSheetJobSchema,
  sendMessageSchema,
  setJobActiveSchema,
  setJobStatusSchema,
  updateJobSchema,
  type CreateJobInput,
  type MoveSheetJobInput,
  type SendMessageInput,
  type UpdateJobInput,
} from "@/lib/validations/jobs";
import { messageFavoriteSchema, messagePinSchema, messageReactionSchema } from "@/lib/validations/messages";
import {
  achievementsAfter,
  onJobCompleted,
  onMessageDeleted,
  onMessageFavorited,
  onMessagePinned,
  onMessageSent,
  onReactionAdded,
} from "@/server/achievements";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { findClientRequestById } from "@/server/client-requests";
import { findClientById } from "@/server/clients";
import {
  canAccessJob,
  filterActiveUserIds,
  findJobById,
  findJobStatusById,
  isAttachmentInUse,
  listAssignees,
  listJobAttachmentKeys,
  listJobStatusHistory,
  listMentionableIds,
  listSheetPositions,
  markJobRead as markRead,
  renumberSheet,
  type JobStatusRecord,
} from "@/server/jobs";
import { deleteMedia, deleteMediaByKey, findMediaById } from "@/server/media";
import {
  countPinnedMessages,
  listMessageExtras,
  setMessagePinned,
  toggleFavorite,
  toggleReaction,
} from "@/server/messages";
import { markJobNotificationsRead } from "@/server/notifications";
import { notifyAssignments, notifyJobMessage, notifyStatusChange } from "@/server/notify";
import { publishRealtimeAfter } from "@/server/realtime";
import { richTextExcerpt, sanitizeRichText } from "@/server/rich-text";

// Só admins cadastram e excluem trabalhos. Editar, mudar status, ativar e
// conversar: admins em qualquer trabalho, o resto da equipe só nos trabalhos em
// que está vinculada (para os outros, o trabalho "não existe"). Cancelar (pôr num
// status de cancelamento) ou tirar de cancelado é só de admins: o cancelado sai da
// planilha, dos relatórios e dos atrasados. Toda mudança vai
// para a auditoria (mensagens não: são conversa). Entrar ou sair do trabalho,
// trocar o status e mandar mensagem notificam os funcionários (src/server/notify.ts).
// Concluir um trabalho e mexer nas mensagens contam para as conquistas
// (src/server/achievements), depois da resposta.

export type JobActionResult =
  | { ok: true; message: string; pit?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const JOB_NOT_FOUND = { ok: false, error: "Trabalho não encontrado." } as const;
const CANCEL_FORBIDDEN = { ok: false, error: "Só um admin cancela um trabalho ou tira um trabalho de cancelado." } as const;

/** Revalida a sessão a cada chamada: nunca confiar no cliente. */
async function getTeamContext() {
  const session = await getSession();
  if (!session) return null;
  const requestHeaders = await headers();
  return {
    actor: session.user,
    isAdmin: session.user.role === "admin",
    meta: getRequestMeta(requestHeaders),
  };
}

type TeamContext = NonNullable<Awaited<ReturnType<typeof getTeamContext>>>;

/** O trabalho, se quem chama pode acessá-lo; senão null (tratado como não encontrado). */
async function findAccessibleJob(ctx: TeamContext, jobId: string) {
  const found = await findJobById(db, jobId);
  if (!found) return null;
  const allowed = await canAccessJob(db, { jobId: found.id, userId: ctx.actor.id, isAdmin: ctx.isAdmin });
  return allowed ? found : null;
}

/** A troca de status mexe no cancelamento (entra ou sai de um status de cancelamento) sem ser admin. */
function blocksCancellation(ctx: TeamContext, previous: { isCanceled: boolean } | null, next: { isCanceled: boolean }) {
  return !ctx.isAdmin && (Boolean(previous?.isCanceled) || next.isCanceled);
}

function invalid(error: z.ZodError): JobActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function jobEntity(row: { id: string; pit: number; name: string }) {
  return { type: "job" as const, id: row.id, label: `#${row.pit} ${row.name}` };
}

function historyEntry(jobId: string, status: JobStatusRecord, actor: { id: string; name: string }) {
  return {
    jobId,
    statusId: status.id,
    statusName: status.name,
    textColor: status.textColor,
    backgroundColor: status.backgroundColor,
    changedById: actor.id,
    changedByName: actor.name,
  };
}

/** Cliente válido para um trabalho: existe e não está arquivado (a não ser que já fosse o dele). */
async function resolveClient(clientId: string, currentClientId?: string) {
  const found = await findClientById(db, clientId);
  if (!found || (found.archivedAt && found.id !== currentClientId)) return null;
  return found;
}

export async function createJob(input: CreateJobInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.isAdmin) return FORBIDDEN;

  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const [targetClient, status, assigneeIds, fromRequest] = await Promise.all([
    resolveClient(data.clientId),
    findJobStatusById(db, data.statusId),
    filterActiveUserIds(db, data.assigneeIds),
    data.clientRequestId ? findClientRequestById(db, data.clientRequestId) : null,
  ]);
  if (!targetClient) return { ok: false, error: "Cliente inválido.", fieldErrors: { clientId: ["Escolha um cliente ativo."] } };
  // Criado a partir de uma solicitação: ela ainda existe e é do mesmo cliente.
  if (data.clientRequestId && !fromRequest) return { ok: false, error: "A solicitação não existe mais." };
  if (fromRequest && fromRequest.client.id !== targetClient.id) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: { clientId: ["O trabalho de uma solicitação é do mesmo cliente dela."] },
    };
  }
  if (!status) return { ok: false, error: "Status inválido.", fieldErrors: { statusId: ["Escolha o status."] } };
  if (status.isCanceled) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: { statusId: ["Um trabalho novo não começa cancelado."] } };
  }

  // O id sai daqui para o trabalho, os funcionários e o histórico irem num lote só (atômico).
  const id = randomUUID();
  try {
    const [[created]] = await db.batch([
      db
        .insert(job)
        .values({
          id,
          name: data.name,
          clientId: targetClient.id,
          statusId: status.id,
          dueDate: data.dueDate,
          active: data.active,
          briefing: sanitizeRichText(data.briefing),
          clientRequestId: fromRequest?.request.id ?? null,
          createdById: ctx.actor.id,
        })
        .returning({ id: job.id, pit: job.pit, name: job.name }),
      db.insert(jobStatusHistory).values(historyEntry(id, status, ctx.actor)),
      ...(assigneeIds.length ? [db.insert(jobAssignee).values(assigneeIds.map((userId) => ({ jobId: id, userId })))] : []),
    ]);
    await recordAudit({
      action: "job.created",
      actor: ctx.actor,
      entity: jobEntity(created),
      metadata: {
        client: targetClient.name,
        status: status.name,
        assignees: assigneeIds.length,
        ...(fromRequest ? { request: requestCode(fromRequest.request.number) } : {}),
      },
      ...ctx.meta,
    });
    notifyAssignments({ job: created, actor: ctx.actor, addedIds: assigneeIds, removedIds: [] });
    return { ok: true, message: `Trabalho #${created.pit} cadastrado.`, pit: created.pit };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível cadastrar o trabalho." };
  }
}

export async function updateJob(input: UpdateJobInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = updateJobSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  const current = await findAccessibleJob(ctx, data.jobId);
  if (!current) return JOB_NOT_FOUND;
  // Quem não é admin só vê os trabalhos em que está: sair da lista o tiraria do próprio trabalho.
  if (!ctx.isAdmin && !data.assigneeIds.includes(ctx.actor.id)) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: { assigneeIds: ["Você não pode se tirar do trabalho. Peça para um admin."] },
    };
  }

  const [targetClient, status, assigneeIds, currentAssignees, currentStatus, currentClient] = await Promise.all([
    resolveClient(data.clientId, current.clientId),
    findJobStatusById(db, data.statusId),
    filterActiveUserIds(db, data.assigneeIds),
    listAssignees(db, [current.id]).then((map) => map.get(current.id) ?? []),
    findJobStatusById(db, current.statusId),
    findClientById(db, current.clientId),
  ]);
  if (!targetClient) return { ok: false, error: "Cliente inválido.", fieldErrors: { clientId: ["Escolha um cliente ativo."] } };
  if (!status) return { ok: false, error: "Status inválido.", fieldErrors: { statusId: ["Escolha o status."] } };

  const briefing = sanitizeRichText(data.briefing);
  const changes: AuditChanges = {};
  if (data.name !== current.name) changes.name = { from: current.name, to: data.name };
  if (targetClient.id !== current.clientId) changes.client = { from: currentClient?.name ?? null, to: targetClient.name };
  if (data.dueDate !== current.dueDate) changes.dueDate = { from: current.dueDate, to: data.dueDate };
  if (data.active !== current.active) changes.active = { from: current.active, to: data.active };
  if ((briefing ?? null) !== (current.briefing ?? null)) {
    changes.briefing = { from: richTextExcerpt(current.briefing), to: richTextExcerpt(briefing) };
  }
  const before = currentAssignees.map((person) => person.id).sort();
  const after = [...assigneeIds].sort();
  const assigneesChanged = before.join() !== after.join();
  // Só sai quem saiu e só entra quem entrou: quem continua mantém a posição na própria planilha.
  const removedIds = before.filter((id) => !after.includes(id));
  const addedIds = after.filter((id) => !before.includes(id));
  if (assigneesChanged) {
    const people = after.length
      ? await db.select({ name: user.name }).from(user).where(inArray(user.id, after))
      : [];
    changes.assignees = { from: currentAssignees.map((person) => person.name), to: people.map((person) => person.name) };
  }
  const statusChanged = status.id !== current.statusId;
  if (statusChanged && blocksCancellation(ctx, currentStatus, status)) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: { statusId: [CANCEL_FORBIDDEN.error] } };
  }
  if (statusChanged) changes.status = { from: currentStatus?.name ?? null, to: status.name };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar.", pit: current.pit };

  try {
    await db.batch([
      db
        .update(job)
        .set({
          name: data.name,
          clientId: targetClient.id,
          statusId: status.id,
          dueDate: data.dueDate,
          active: data.active,
          briefing,
          ...(statusChanged ? { statusChangedAt: new Date() } : {}),
        })
        .where(eq(job.id, current.id)),
      ...(statusChanged ? [db.insert(jobStatusHistory).values(historyEntry(current.id, status, ctx.actor))] : []),
      ...(removedIds.length
        ? [db.delete(jobAssignee).where(and(eq(jobAssignee.jobId, current.id), inArray(jobAssignee.userId, removedIds)))]
        : []),
      ...(addedIds.length
        ? [db.insert(jobAssignee).values(addedIds.map((userId) => ({ jobId: current.id, userId })))]
        : []),
    ]);
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível salvar o trabalho." };
  }
  await recordAudit({
    action: "job.updated",
    actor: ctx.actor,
    entity: jobEntity({ ...current, name: data.name }),
    metadata: { changes },
    ...ctx.meta,
  });
  const updated = { id: current.id, pit: current.pit, name: data.name };
  notifyAssignments({ job: updated, actor: ctx.actor, addedIds, removedIds });
  // Quem acabou de entrar já recebe "incluiu você", com o trabalho no status novo.
  if (statusChanged) notifyStatusChange({ job: updated, actor: ctx.actor, status, skipIds: addedIds });
  if (statusChanged) trackCompletion(current.id, currentStatus, status);

  refresh();
  return { ok: true, message: `Trabalho #${current.pit} atualizado.`, pit: current.pit };
}

/** Troca só o status (pela lista ou pela página do trabalho). */
export async function setJobStatus(input: { jobId: string; statusId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = setJobStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const [current, status] = await Promise.all([
    findAccessibleJob(ctx, parsed.data.jobId),
    findJobStatusById(db, parsed.data.statusId),
  ]);
  if (!current) return JOB_NOT_FOUND;
  if (!status) return { ok: false, error: "Status inválido." };
  if (status.id === current.statusId) return { ok: true, message: "O trabalho já está nesse status." };

  const previous = await findJobStatusById(db, current.statusId);
  if (blocksCancellation(ctx, previous, status)) return CANCEL_FORBIDDEN;
  await db.batch(statusChangeQueries(current.id, status, ctx.actor));
  await auditStatusChange(ctx, current, previous, status);
  notifyStatusChange({ job: current, actor: ctx.actor, status });
  trackCompletion(current.id, previous, status);

  refresh();
  return { ok: true, message: `#${current.pit}: ${status.name}.` };
}

/** Escritas de uma troca de status: o trabalho e o histórico (vão no mesmo lote de quem chama). */
function statusChangeQueries(jobId: string, status: JobStatusRecord, actor: { id: string; name: string }) {
  return [
    db.update(job).set({ statusId: status.id, statusChangedAt: new Date() }).where(eq(job.id, jobId)),
    db.insert(jobStatusHistory).values(historyEntry(jobId, status, actor)),
  ] as const;
}

async function auditStatusChange(
  ctx: TeamContext,
  current: { id: string; pit: number; name: string },
  previous: JobStatusRecord | null,
  status: JobStatusRecord,
) {
  await recordAudit({
    action: "job.status_changed",
    actor: ctx.actor,
    entity: jobEntity(current),
    metadata: { changes: { status: { from: previous?.name ?? null, to: status.name } } },
    ...ctx.meta,
  });
}

/** Trabalho concluído (isJobCompletion: entrou num status que encerra; cancelar não conta): conquistas de quem está nele. */
function trackCompletion(jobId: string, previous: JobStatusRecord | null, next: JobStatusRecord) {
  if (!isJobCompletion(previous, next)) return;
  achievementsAfter("trabalho concluído", (database) => onJobCompleted(database, { jobId }));
}

/**
 * Minha planilha: arrasta um trabalho para entre dois vizinhos (lista ou coluna
 * do quadro). No quadro, soltar em outra coluna também troca o status. Só quem
 * é dono da planilha ou um admin reorganiza; trocar o status segue a regra de acesso.
 */
export async function moveSheetJob(input: MoveSheetJobInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = moveSheetJobSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Movimento inválido." };
  const { ownerId, jobId, beforeId, afterId, statusId } = parsed.data;
  if (ownerId !== ctx.actor.id && !ctx.isAdmin) return FORBIDDEN;

  const [current, status] = await Promise.all([
    findAccessibleJob(ctx, jobId),
    statusId ? findJobStatusById(db, statusId) : null,
  ]);
  if (!current) return JOB_NOT_FOUND;
  if (statusId && !status) return { ok: false, error: "Status inválido." };
  const newStatus = status && status.id !== current.statusId ? status : null;
  const previous = newStatus ? await findJobStatusById(db, current.statusId) : null;
  if (newStatus && blocksCancellation(ctx, previous, newStatus)) return CANCEL_FORBIDDEN;

  const neighbors = [beforeId, afterId].filter((id): id is string => Boolean(id));
  let positions = await listSheetPositions(db, ownerId, [jobId, ...neighbors]);
  if (!positions.has(jobId)) return { ok: false, error: "Esse trabalho não está nessa planilha." };
  // Vizinho que saiu da planilha nesse meio-tempo é ignorado.
  let position = positionBetween(beforeId ? positions.get(beforeId) : undefined, afterId ? positions.get(afterId) : undefined);
  if (position === null) {
    await renumberSheet(db, ownerId);
    positions = await listSheetPositions(db, ownerId, neighbors);
    position = positionBetween(beforeId ? positions.get(beforeId) : undefined, afterId ? positions.get(afterId) : undefined);
  }

  const moveQuery =
    typeof position === "number"
      ? [
          db
            .update(jobAssignee)
            .set({ position })
            .where(and(eq(jobAssignee.jobId, jobId), eq(jobAssignee.userId, ownerId))),
        ]
      : [];
  const queries = [...(newStatus ? statusChangeQueries(current.id, newStatus, ctx.actor) : []), ...moveQuery];
  if (queries.length === 0) return { ok: true, message: "" };
  const [first, ...rest] = queries;
  await db.batch([first, ...rest]);
  if (newStatus) {
    await auditStatusChange(ctx, current, previous, newStatus);
    notifyStatusChange({ job: current, actor: ctx.actor, status: newStatus });
    trackCompletion(current.id, previous, newStatus);
  }

  refresh();
  return { ok: true, message: newStatus ? `#${current.pit}: ${newStatus.name}.` : "" };
}

export async function setJobActive(input: { jobId: string; active: boolean }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = setJobActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Trabalho inválido." };
  const current = await findAccessibleJob(ctx, parsed.data.jobId);
  if (!current) return JOB_NOT_FOUND;
  const { active } = parsed.data;
  if (current.active === active) return { ok: true, message: active ? "O trabalho já estava ativo." : "O trabalho já estava inativo." };

  await db.update(job).set({ active }).where(eq(job.id, current.id));
  await recordAudit({
    action: active ? "job.activated" : "job.deactivated",
    actor: ctx.actor,
    entity: jobEntity(current),
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: active ? `#${current.pit} ativado.` : `#${current.pit} desativado.` };
}

/** Exclui de vez (só admins): mensagens, anexos (também no CDN) e histórico vão junto. */
export async function deleteJob(input: { jobId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.isAdmin) return FORBIDDEN;

  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Trabalho inválido." };
  const current = await findJobById(db, parsed.data.jobId);
  if (!current) return JOB_NOT_FOUND;

  const [attachmentKeys, assigneeIds] = await Promise.all([
    listJobAttachmentKeys(db, current.id),
    listMentionableIds(db, current.id),
  ]);
  await db.delete(job).where(eq(job.id, current.id));
  // As notificações do trabalho saíram junto: o sino de quem estava nele reconta.
  publishRealtimeAfter(assigneeIds, { type: "notifications.read" });
  for (const key of attachmentKeys) {
    await deleteMediaByKey(db, key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "job.deleted",
    actor: ctx.actor,
    entity: jobEntity(current),
    metadata: { pit: current.pit, attachments: attachmentKeys.length },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Trabalho #${current.pit} excluído.` };
}

// Mensagens

export async function sendMessage(input: SendMessageInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { jobId, attachmentIds } = parsed.data;
  // "/party" e companhia ficam guardados sempre do mesmo jeito.
  const body = normalizeMessageBody(parsed.data.body);
  const current = await findAccessibleJob(ctx, jobId);
  if (!current) return JOB_NOT_FOUND;

  // Anexos: arquivos que a própria pessoa enviou para a pasta "trabalhos".
  const files = await Promise.all(attachmentIds.map((mediaId) => findMediaById(db, mediaId)));
  if (files.some((file) => !file || file.uploadedById !== ctx.actor.id || file.folder !== "trabalhos")) {
    return { ok: false, error: "Um dos anexos é inválido. Envie de novo." };
  }
  // Menções só de funcionários ativos do trabalho; as outras não contam como menção.
  const mentionable = new Set(await listMentionableIds(db, current.id));
  const mentions = extractMentions(body).filter((userId) => mentionable.has(userId));

  const messageId = randomUUID();
  await db.batch([
    db.insert(jobMessage).values({
      id: messageId,
      jobId: current.id,
      authorId: ctx.actor.id,
      authorName: ctx.actor.name,
      body,
      mentions,
    }),
    ...(attachmentIds.length
      ? [db.insert(jobMessageAttachment).values(attachmentIds.map((mediaId) => ({ messageId, mediaId })))]
      : []),
  ]);
  await markRead(db, current.id, ctx.actor.id);
  notifyJobMessage({ job: current, actor: ctx.actor, body, attachmentCount: attachmentIds.length, mentionIds: mentions });
  achievementsAfter("mensagem do trabalho", (database) =>
    onMessageSent(database, {
      kind: "job",
      authorId: ctx.actor.id,
      body,
      mentions,
      attachments: attachmentIds.length,
      pastedImage: parsed.data.pastedImage,
    }),
  );

  refresh();
  return { ok: true, message: "Mensagem enviada." };
}

/** Quem escreveu (ou um admin) apaga a mensagem; os anexos saem do CDN. */
export async function deleteMessage(input: { messageId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = messageTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const [found] = await db.select().from(jobMessage).where(eq(jobMessage.id, parsed.data.messageId)).limit(1);
  const current = found ? await findAccessibleJob(ctx, found.jobId) : null;
  if (!found || !current) return { ok: false, error: "Mensagem não encontrada." };
  if (found.authorId !== ctx.actor.id && !ctx.isAdmin) return FORBIDDEN;

  const attachments = await db
    .select({ mediaId: jobMessageAttachment.mediaId })
    .from(jobMessageAttachment)
    .where(eq(jobMessageAttachment.messageId, found.id));
  await db.delete(jobMessage).where(eq(jobMessage.id, found.id));
  for (const { mediaId } of attachments) {
    const file = await findMediaById(db, mediaId);
    if (file) await deleteMediaByKey(db, file.key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "job.message_deleted",
    actor: ctx.actor,
    entity: jobEntity(current),
    metadata: { author: found.authorName, attachments: attachments.length },
    ...ctx.meta,
  });
  achievementsAfter("mensagem apagada", (database) =>
    onMessageDeleted(database, { authorId: found.authorId, actorId: ctx.actor.id }),
  );

  refresh();
  return { ok: true, message: "Mensagem excluída." };
}

/** Mensagem de um trabalho que quem pede pode acessar (null para os outros). */
async function findAccessibleMessage(ctx: TeamContext, messageId: string) {
  const [message] = await db.select().from(jobMessage).where(eq(jobMessage.id, messageId)).limit(1);
  const current = message ? await findAccessibleJob(ctx, message.jobId) : null;
  return message && current ? { message, job: current } : null;
}

/** Reações e fixadas mudaram: quem está com o trabalho aberto recarrega a conversa. */
async function publishMessagesUpdate(jobId: string, actorId: string) {
  const people = await listMentionableIds(db, jobId);
  publishRealtimeAfter([...new Set([actorId, ...people])], { type: "job.messages", jobId });
}

const MESSAGE_NOT_FOUND = { ok: false, error: "Mensagem não encontrada." } as const;

/** Liga ou desliga uma reação. Devolve as reações da mensagem como ficaram. */
export async function reactToJobMessage(input: { messageId: string; emoji: string }): Promise<MessageUpdateResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = messageReactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Reação inválida." };
  const target = await findAccessibleMessage(ctx, parsed.data.messageId);
  if (!target) return MESSAGE_NOT_FOUND;

  const added = await toggleReaction(db, "job", { messageId: target.message.id, userId: ctx.actor.id, emoji: parsed.data.emoji });
  const { reactions } = await listMessageExtras(db, "job", [target.message.id], ctx.actor.id);
  await publishMessagesUpdate(target.job.id, ctx.actor.id);
  if (added) {
    achievementsAfter("reação", (database) =>
      onReactionAdded(database, { kind: "job", messageId: target.message.id, userId: ctx.actor.id }),
    );
  }
  refresh();
  return { ok: true, reactions: toReactionViews(reactions.get(target.message.id) ?? [], ctx.actor.id) };
}

/** Fixa no topo da conversa do trabalho (para todo mundo dele) ou desafixa. */
export async function setJobMessagePinned(input: { messageId: string; pinned: boolean }): Promise<MessageUpdateResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = messagePinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const target = await findAccessibleMessage(ctx, parsed.data.messageId);
  if (!target) return MESSAGE_NOT_FOUND;
  const { pinned } = parsed.data;
  if (pinned && !target.message.pinnedAt) {
    if ((await countPinnedMessages(db, "job", target.job.id)) >= PINNED_MESSAGES_MAX) {
      return { ok: false, error: `Já há ${PINNED_MESSAGES_MAX} mensagens fixadas. Desafixe uma antes.` };
    }
  }

  await setMessagePinned(db, "job", target.message.id, pinned ? ctx.actor : null);
  await publishMessagesUpdate(target.job.id, ctx.actor.id);
  if (pinned && !target.message.pinnedAt) {
    achievementsAfter("mensagem fixada", (database) =>
      onMessagePinned(database, { kind: "job", messageId: target.message.id, actorId: ctx.actor.id }),
    );
  }
  refresh();
  return { ok: true, pinned };
}

/** Guarda nas favoritas de quem pede (só ela vê), ou tira. */
export async function toggleJobMessageFavorite(input: { messageId: string }): Promise<MessageUpdateResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = messageFavoriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const target = await findAccessibleMessage(ctx, parsed.data.messageId);
  if (!target) return MESSAGE_NOT_FOUND;

  const favorite = await toggleFavorite(db, "job", { messageId: target.message.id, userId: ctx.actor.id });
  if (favorite) achievementsAfter("favorita", (database) => onMessageFavorited(database, { userId: ctx.actor.id }));
  refresh();
  return { ok: true, favorite };
}

/** Anexo enviado e tirado do rascunho antes de mandar a mensagem: sai do CDN. */
export async function discardAttachment(input: { mediaId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = z.object({ mediaId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Anexo inválido." };
  const file = await findMediaById(db, parsed.data.mediaId);
  if (!file) return { ok: true, message: "Anexo removido." };
  if (file.uploadedById !== ctx.actor.id || file.folder !== "trabalhos") return FORBIDDEN;
  if (await isAttachmentInUse(db, file.id)) return { ok: false, error: "Este anexo já está numa mensagem." };

  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta, audit: false });
  return result.ok ? { ok: true, message: "Anexo removido." } : { ok: false, error: result.error };
}

/** Zera as não lidas de quem está vendo o trabalho, inclusive as notificações dele no sino. */
export async function markJobRead(input: { jobId: string }) {
  const ctx = await getTeamContext();
  if (!ctx) return;
  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return;
  const current = await findAccessibleJob(ctx, parsed.data.jobId);
  if (!current) return;
  const [, cleared] = await Promise.all([
    markRead(db, current.id, ctx.actor.id),
    markJobNotificationsRead(db, ctx.actor.id, current.id),
  ]);
  // O sino das outras abas (e o desta) reconta.
  if (cleared > 0) publishRealtimeAfter([ctx.actor.id], { type: "notifications.read" });
}

// Leituras sob demanda (modal do briefing e histórico na lista)

export async function getJobBriefing(input: { jobId: string }) {
  const ctx = await getTeamContext();
  if (!ctx) return null;
  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const found = await findAccessibleJob(ctx, parsed.data.jobId);
  return found ? { html: found.briefing } : null;
}

export async function getJobStatusHistory(input: { jobId: string }) {
  const ctx = await getTeamContext();
  if (!ctx) return null;
  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const current = await findAccessibleJob(ctx, parsed.data.jobId);
  if (!current) return null;
  const rows = await listJobStatusHistory(db, current.id);
  return rows.map((row) => ({
    id: row.id,
    statusName: row.statusName,
    textColor: row.textColor,
    backgroundColor: row.backgroundColor,
    changedByName: row.changedByName,
    changedAt: row.changedAt.toISOString(),
  }));
}
