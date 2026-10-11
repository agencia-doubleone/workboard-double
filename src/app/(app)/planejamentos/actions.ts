"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { planning, planningMember, planningMonth, planningPost } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { formatMonth } from "@/lib/calendar";
import { PLANNING_STATUSES, SOCIAL_NETWORKS, type PlanningStatus } from "@/lib/planning";
import { getSession } from "@/lib/session";
import {
  createPlanningSchema,
  importPostsSchema,
  planningTargetSchema,
  postTargetSchema,
  savePostSchema,
  setAllPostsStatusSchema,
  setConceptSchema,
  setMonthStatusSchema,
  setPostStatusSchema,
  updatePlanningSchema,
  type CreatePlanningInput,
  type ImportPostsInput,
  type SavePostInput,
  type UpdatePlanningInput,
} from "@/lib/validations/planning";
import {
  achievementsAfter,
  onPlanningMembersAdded,
  onPlanningMonthStatus,
  onPlanningPostsAdded,
} from "@/server/achievements";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { findClientById } from "@/server/clients";
import { filterActiveUserIds } from "@/server/jobs";
import { notifyPlanningMembers, notifyPlanningStatus } from "@/server/notify";
import {
  ensurePlanningMonth,
  findPlanningById,
  findPlanningPost,
  nextPostPosition,
  type PlanningWithClient,
} from "@/server/planning";
import { richTextExcerpt, sanitizeRichText } from "@/server/rich-text";

// Planejamentos de redes sociais. Toda a equipe vê e edita; só admins excluem
// um planejamento inteiro. Quem entra como responsável é avisado
// (notifyPlanningMembers), e as mudanças de status avisam os responsáveis
// (notifyPlanningStatus). Na auditoria entram criação, edição, exclusão,
// status do mês e importação (status de cada post não: é o dia a dia).
// Responsáveis, status do mês e posts novos contam para as conquistas.

export type PlanningActionResult =
  | { ok: true; message: string; slug?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const NOT_FOUND = { ok: false, error: "Planejamento não encontrado." } as const;

async function getContext() {
  const session = await getSession();
  if (!session) return null;
  return {
    actor: session.user,
    isAdmin: session.user.role === "admin",
    meta: getRequestMeta(await headers()),
  };
}

function invalid(error: z.ZodError): PlanningActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function planningEntity(found: PlanningWithClient) {
  return { type: "planning" as const, id: found.planning.id, label: found.client.name };
}

function notifyTarget(found: PlanningWithClient) {
  return { id: found.planning.id, clientName: found.client.name, clientSlug: found.client.slug };
}

export async function createPlanning(input: CreatePlanningInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = createPlanningSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const target = await findClientById(db, data.clientId);
  if (!target || target.archivedAt) {
    return { ok: false, error: "Cliente inválido.", fieldErrors: { clientId: ["Escolha um cliente ativo."] } };
  }
  const memberIds = await filterActiveUserIds(db, data.memberIds);
  const id = randomUUID();
  try {
    await db.batch([
      db.insert(planning).values({
        id,
        clientId: target.id,
        networks: data.networks,
        postsPerMonth: data.postsPerMonth,
        overview: sanitizeRichText(data.overview),
        createdById: ctx.actor.id,
      }),
      ...(memberIds.length
        ? [db.insert(planningMember).values(memberIds.map((userId) => ({ planningId: id, userId })))]
        : []),
    ]);
  } catch (error) {
    // planning.client_id é único: o cliente ganhou um planejamento nesse meio-tempo.
    console.error(error);
    return { ok: false, error: "Esse cliente já tem planejamento.", fieldErrors: { clientId: ["Esse cliente já tem planejamento."] } };
  }
  await recordAudit({
    action: "planning.created",
    actor: ctx.actor,
    entity: { type: "planning", id, label: target.name },
    metadata: { networks: data.networks, postsPerMonth: data.postsPerMonth, members: memberIds.length },
    ...ctx.meta,
  });
  notifyPlanningMembers({
    planning: { id, clientName: target.name, clientSlug: target.slug },
    actor: ctx.actor,
    userIds: memberIds,
  });
  if (memberIds.length) {
    achievementsAfter("responsáveis", (database) => onPlanningMembersAdded(database, { userIds: memberIds }));
  }
  return { ok: true, message: `Planejamento de ${target.name} criado.`, slug: target.slug };
}

export async function updatePlanning(input: UpdatePlanningInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = updatePlanningSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  const found = await findPlanningById(db, data.planningId);
  if (!found) return NOT_FOUND;

  const memberIds = await filterActiveUserIds(db, data.memberIds);
  const overview = sanitizeRichText(data.overview);
  const before = found.members.map((person) => person.id);
  const removed = before.filter((id) => !memberIds.includes(id));
  const added = memberIds.filter((id) => !before.includes(id));
  const label = (networks: string[]) => networks.map((network) => SOCIAL_NETWORKS[network as keyof typeof SOCIAL_NETWORKS] ?? network).join(", ");

  const changes: AuditChanges = {};
  if (label(found.planning.networks) !== label(data.networks)) {
    changes.networks = { from: label(found.planning.networks), to: label(data.networks) };
  }
  if (found.planning.postsPerMonth !== data.postsPerMonth) {
    changes.postsPerMonth = { from: found.planning.postsPerMonth, to: data.postsPerMonth };
  }
  if ((found.planning.overview ?? null) !== (overview ?? null)) {
    changes.overview = { from: richTextExcerpt(found.planning.overview), to: richTextExcerpt(overview) };
  }
  if (removed.length || added.length) changes.members = { from: before.length, to: memberIds.length };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar.", slug: found.client.slug };

  await db.batch([
    db
      .update(planning)
      .set({ networks: data.networks, postsPerMonth: data.postsPerMonth, overview })
      .where(eq(planning.id, found.planning.id)),
    ...(removed.length
      ? [db.delete(planningMember).where(and(eq(planningMember.planningId, found.planning.id), inArray(planningMember.userId, removed)))]
      : []),
    ...(added.length ? [db.insert(planningMember).values(added.map((userId) => ({ planningId: found.planning.id, userId })))] : []),
  ]);
  await recordAudit({ action: "planning.updated", actor: ctx.actor, entity: planningEntity(found), metadata: { changes }, ...ctx.meta });
  notifyPlanningMembers({ planning: notifyTarget(found), actor: ctx.actor, userIds: added });
  if (added.length) achievementsAfter("responsáveis", (database) => onPlanningMembersAdded(database, { userIds: added }));

  refresh();
  return { ok: true, message: "Planejamento atualizado.", slug: found.client.slug };
}

/** Exclui o planejamento inteiro (todos os meses e posts). Só admins. */
export async function deletePlanning(input: { planningId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.isAdmin) return { ok: false, error: "Só admins excluem um planejamento." };
  const parsed = planningTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;

  await db.delete(planning).where(eq(planning.id, found.planning.id));
  await recordAudit({ action: "planning.deleted", actor: ctx.actor, entity: planningEntity(found), ...ctx.meta });
  refresh();
  return { ok: true, message: `Planejamento de ${found.client.name} excluído.` };
}

export async function setMonthStatus(input: { planningId: string; month: string; status: PlanningStatus }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = setMonthStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const { month, status } = parsed.data;
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;

  const current = await ensurePlanningMonth(db, found.planning.id, month);
  if (current.status === status) return { ok: true, message: "O mês já está nesse status." };
  const now = new Date();
  await db
    .update(planningMonth)
    // "Ajustes pedidos" fica marcado no mês (a conquista "Aprovado de Primeira" olha isso).
    .set({ status, statusChangedAt: now, ...(status === "ajustes" ? { adjustmentsRequestedAt: now } : {}) })
    .where(eq(planningMonth.id, current.id));
  await recordAudit({
    action: "planning.month_status_changed",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month, changes: { status: { from: PLANNING_STATUSES[current.status].label, to: PLANNING_STATUSES[status].label } } },
    ...ctx.meta,
  });
  notifyPlanningStatus({ planning: notifyTarget(found), actor: ctx.actor, month, status });
  achievementsAfter("status do mês", (database) =>
    onPlanningMonthStatus(database, {
      planningId: found.planning.id,
      monthId: current.id,
      month,
      previous: current.status,
      next: status,
      adjustmentsRequestedAt: current.adjustmentsRequestedAt,
    }),
  );

  refresh();
  return { ok: true, message: `${formatMonth(month)}: ${PLANNING_STATUSES[status].label}.` };
}

export async function setConcept(input: { planningId: string; month: string; concept: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = setConceptSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;

  const current = await ensurePlanningMonth(db, found.planning.id, parsed.data.month);
  await db.update(planningMonth).set({ concept: parsed.data.concept }).where(eq(planningMonth.id, current.id));
  refresh();
  return { ok: true, message: "Conceito salvo." };
}

/** Salva os posts lidos do documento colado (já conferidos na prévia) e guarda o texto original. */
export async function importPosts(input: ImportPostsInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = importPostsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Importação inválida." };
  const data = parsed.data;
  const found = await findPlanningById(db, data.planningId);
  if (!found) return NOT_FOUND;

  const current = await ensurePlanningMonth(db, found.planning.id, data.month);
  const start = data.mode === "replace" ? 0 : await nextPostPosition(db, current.id);
  const network = found.planning.networks[0] ?? "instagram";
  await db.batch([
    db
      .update(planningMonth)
      .set({ document: data.document || current.document, ...(data.concept ? { concept: data.concept } : {}) })
      .where(eq(planningMonth.id, current.id)),
    ...(data.mode === "replace" ? [db.delete(planningPost).where(eq(planningPost.monthId, current.id))] : []),
    ...(data.posts.length
      ? [
          db.insert(planningPost).values(
            data.posts.map((post, index) => ({
              monthId: current.id,
              position: start + index,
              date: post.date,
              network: post.network ?? network,
              format: post.format,
              topic: post.topic,
              headline: post.headline,
              copy: post.copy,
              sections: post.sections,
            })),
          ),
        ]
      : []),
  ]);
  await recordAudit({
    action: "planning.imported",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month: data.month, posts: data.posts.length, replaced: data.mode === "replace" },
    ...ctx.meta,
  });
  if (data.posts.length) {
    achievementsAfter("posts importados", (database) =>
      onPlanningPostsAdded(database, {
        planningId: found.planning.id,
        monthId: current.id,
        month: data.month,
        actorId: ctx.actor.id,
        imported: true,
      }),
    );
  }

  refresh();
  const count = data.posts.length;
  return {
    ok: true,
    message: count === 0 ? "Documento guardado no mês." : `${count} ${count === 1 ? "post importado" : "posts importados"}.`,
  };
}

/** Cria (sem postId) ou edita um post do mês. */
export async function savePost(input: SavePostInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = savePostSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { planningId, month, postId, status, ...fields } = parsed.data;
  const found = await findPlanningById(db, planningId);
  if (!found) return NOT_FOUND;

  if (postId) {
    const existing = await findPlanningPost(db, postId);
    if (!existing || existing.month.planningId !== found.planning.id) return { ok: false, error: "Post não encontrado." };
    await db.update(planningPost).set(fields).where(eq(planningPost.id, postId));
    refresh();
    return { ok: true, message: "Post salvo." };
  }

  const current = await ensurePlanningMonth(db, found.planning.id, month);
  await db.insert(planningPost).values({
    monthId: current.id,
    position: await nextPostPosition(db, current.id),
    ...fields,
    ...(status ? { status } : {}),
  });
  achievementsAfter("post criado", (database) =>
    onPlanningPostsAdded(database, { planningId: found.planning.id, monthId: current.id, month, actorId: ctx.actor.id, imported: false }),
  );
  refresh();
  return { ok: true, message: "Post criado." };
}

export async function deletePost(input: { postId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = postTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Post inválido." };
  const existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };

  await db.delete(planningPost).where(eq(planningPost.id, existing.post.id));
  refresh();
  return { ok: true, message: "Post excluído." };
}

/** Exclui todos os posts do mês (para importar de novo do zero, por exemplo). */
export async function deleteMonthPosts(input: { planningId: string; month: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = setAllPostsStatusSchema.omit({ status: true }).safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;

  const current = await ensurePlanningMonth(db, found.planning.id, parsed.data.month);
  const removed = await db.delete(planningPost).where(eq(planningPost.monthId, current.id)).returning({ id: planningPost.id });
  await recordAudit({
    action: "planning.posts_deleted",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month: parsed.data.month, posts: removed.length },
    ...ctx.meta,
  });
  refresh();
  return { ok: true, message: `${removed.length} ${removed.length === 1 ? "post excluído" : "posts excluídos"}.` };
}

export async function setPostStatus(input: { postId: string; status: PlanningStatus }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = setPostStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };
  if (existing.post.status === parsed.data.status) return { ok: true, message: "O post já está nesse status." };
  const found = await findPlanningById(db, existing.month.planningId);
  if (!found) return NOT_FOUND;

  await db
    .update(planningPost)
    .set({ status: parsed.data.status, statusChangedAt: new Date() })
    .where(eq(planningPost.id, existing.post.id));
  notifyPlanningStatus({
    planning: notifyTarget(found),
    actor: ctx.actor,
    month: existing.month.month,
    status: parsed.data.status,
    post: { headline: existing.post.headline, date: existing.post.date },
  });

  refresh();
  return { ok: true, message: `Post: ${PLANNING_STATUSES[parsed.data.status].label}.` };
}

/** Todos os posts do mês num status só (ex.: o cliente aprovou tudo). Um aviso só para os responsáveis. */
export async function setAllPostsStatus(input: { planningId: string; month: string; status: PlanningStatus }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = setAllPostsStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const { month, status } = parsed.data;
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;

  const current = await ensurePlanningMonth(db, found.planning.id, month);
  const updated = await db
    .update(planningPost)
    .set({ status, statusChangedAt: new Date() })
    .where(eq(planningPost.monthId, current.id))
    .returning({ id: planningPost.id });
  if (updated.length === 0) return { ok: false, error: "O mês ainda não tem posts." };
  notifyPlanningStatus({
    planning: notifyTarget(found),
    actor: ctx.actor,
    month,
    status,
    post: { headline: `Todos os ${updated.length} posts do mês`, date: null },
  });

  refresh();
  return { ok: true, message: `${updated.length} posts: ${PLANNING_STATUSES[status].label}.` };
}
