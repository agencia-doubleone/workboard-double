"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { planning, planningMember, planningMonth, planningPost, planningPostAsset, planningPostEvent } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { formatMonth } from "@/lib/calendar";
import {
  briefChanged,
  canUploadArt,
  captionChanged,
  isArtShared,
  isWaitingClient,
  postStageOf,
  postStatusLabel,
  postStatusValue,
  keepValidArt,
  artMediaKind,
  PLANNING_STATUSES,
  SOCIAL_NETWORKS,
  type ApprovalStage,
  type ArtRole,
  type PlanningPostEventData,
  type PlanningStatus,
} from "@/lib/planning";
import { getSession } from "@/lib/session";
import {
  createPlanningSchema,
  importPostsSchema,
  mediaTargetSchema,
  planningTargetSchema,
  postTargetSchema,
  registerDecisionSchema,
  savePostArtSchema,
  savePostSchema,
  sendForApprovalSchema,
  sendTargetSchema,
  setAllPostsStatusSchema,
  setConceptSchema,
  setMonthStatusSchema,
  setPostStatusSchema,
  updatePlanningSchema,
  type CreatePlanningInput,
  type ImportPostsInput,
  type RegisterDecisionInput,
  type SavePostArtInput,
  type SavePostInput,
  type SendForApprovalInput,
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
import { deleteMedia, findMediaById } from "@/server/media";
import { notifyPlanningAnswered, notifyPlanningMembers, notifyPlanningStatus, notifyPortalPlanning } from "@/server/notify";
import {
  ensurePlanningMonth,
  findPlanningById,
  findPlanningMonth,
  findPlanningPost,
  nextPostPosition,
  type PlanningWithClient,
} from "@/server/planning";
import {
  artChangeQueries,
  listArtMediaIds,
  listPostArt,
  listReplaceablePostIds,
  planArtChange,
  postEventValues,
  undoBriefApproval,
} from "@/server/planning-approvals";
import {
  closeEmptySends,
  createSend,
  registerTeamDecisions,
  withdrawPostFromSend,
  withdrawSend,
  type DecisionOutcome,
} from "@/server/planning-sends";
import { richTextExcerpt, sanitizeRichText } from "@/server/rich-text";

// Planejamentos de redes sociais. Toda a equipe vê e edita; só admins excluem
// um planejamento inteiro. Quem entra como responsável é avisado
// (notifyPlanningMembers), e as mudanças de status avisam os responsáveis
// (notifyPlanningStatus). Na auditoria entram criação, edição, exclusão,
// status do mês e importação (status de cada post não: é o dia a dia).
// Responsáveis, status do mês e posts novos contam para as conquistas.
// Artes e pauta (docs/planejamentos-no-portal.md): as artes sobem para o CDN
// (pasta "planejamentos") e entram no post ao salvar; com "Aprovar pauta",
// só depois da pauta aprovada. Admins registram a aprovação da pauta em nome
// do cliente. Excluir post, mês ou planejamento apaga as artes do CDN.

export type PlanningActionResult =
  | { ok: true; message: string; slug?: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** A edição tira aprovações: o editor confirma e manda de novo com `approval`. */
      needsApproval?: ApprovalStage[];
    };

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

type Context = NonNullable<Awaited<ReturnType<typeof getContext>>>;

/**
 * Apaga do CDN as artes que saíram (post, mês ou planejamento excluídos, arte
 * trocada antes de ir ao cliente). Quem chama já gravou; falha só vai para o log.
 */
async function removeArtFiles(mediaIds: string[], ctx: Context) {
  for (const id of mediaIds) {
    const result = await deleteMedia(db, { id, actor: ctx.actor, meta: ctx.meta, audit: false, ownerCheck: false });
    if (!result.ok && result.status !== 404) console.error("[planejamentos] arte não foi apagada", id, result.error);
  }
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
        approvesBrief: data.approvesBrief,
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
    metadata: { networks: data.networks, postsPerMonth: data.postsPerMonth, members: memberIds.length, approvesBrief: data.approvesBrief },
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
  if (found.planning.approvesBrief !== data.approvesBrief) {
    changes.approvesBrief = { from: found.planning.approvesBrief ? "Sim" : "Não", to: data.approvesBrief ? "Sim" : "Não" };
  }
  if (removed.length || added.length) changes.members = { from: before.length, to: memberIds.length };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar.", slug: found.client.slug };

  await db.batch([
    db
      .update(planning)
      .set({ networks: data.networks, postsPerMonth: data.postsPerMonth, overview, approvesBrief: data.approvesBrief })
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

  const artFiles = await listArtMediaIds(db, { planningId: found.planning.id });
  await db.delete(planning).where(eq(planning.id, found.planning.id));
  await removeArtFiles(artFiles, ctx);
  await recordAudit({
    action: "planning.deleted",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { artFiles: artFiles.length },
    ...ctx.meta,
  });
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

/** Salva os posts lidos do JSON padrão (já conferidos na prévia, src/lib/planning-json.ts). */
export async function importPosts(input: ImportPostsInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = importPostsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Importação inválida." };
  const data = parsed.data;
  const found = await findPlanningById(db, data.planningId);
  if (!found) return NOT_FOUND;

  const current = await ensurePlanningMonth(db, found.planning.id, data.month);
  // "Substituir" só apaga o que nunca saiu do rascunho: post com arte ou pauta aprovada fica.
  const replaceable = data.mode === "replace" ? await listReplaceablePostIds(db, current.id) : [];
  const start = await nextPostPosition(db, current.id);
  const network = found.planning.networks[0] ?? "instagram";
  const insert = db.insert(planningPost).values(
    data.posts.map((post, index) => ({
      ...post,
      monthId: current.id,
      position: start + index,
      network: post.network ?? network,
    })),
  );
  if (replaceable.length) {
    await db.batch([db.delete(planningPost).where(inArray(planningPost.id, replaceable)), insert]);
  } else {
    await insert;
  }
  await recordAudit({
    action: "planning.imported",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month: data.month, posts: data.posts.length, replaced: data.mode === "replace", removed: replaceable.length },
    ...ctx.meta,
  });
  achievementsAfter("posts importados", (database) =>
    onPlanningPostsAdded(database, {
      planningId: found.planning.id,
      monthId: current.id,
      month: data.month,
      actorId: ctx.actor.id,
      imported: true,
    }),
  );

  refresh();
  const count = data.posts.length;
  return { ok: true, message: `${count} ${count === 1 ? "post importado" : "posts importados"}.` };
}

/** Cria (sem postId) ou edita um post do mês, com as artes. */
export async function savePost(input: SavePostInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = savePostSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { planningId, month, postId, status, art, approval, ...fields } = parsed.data;
  const found = await findPlanningById(db, planningId);
  if (!found) return NOT_FOUND;

  if (postId) {
    const existing = await findPlanningPost(db, postId);
    if (!existing || existing.month.planningId !== found.planning.id) return { ok: false, error: "Post não encontrado." };
    return updatePost(ctx, found, existing.post, fields, art, approval);
  }

  const id = randomUUID();
  const items = art ?? [];
  if (items.length && !canUploadArt(found.planning, { briefState: "rascunho", hasArt: false })) return ART_NEEDS_BRIEF;
  const plan = await planArtChange(db, { post: { id, kind: fields.kind, artState: "sem_arte" }, items, actorId: ctx.actor.id });
  if (!plan.ok) return { ok: false, error: plan.error };
  const current = await ensurePlanningMonth(db, found.planning.id, month);
  await db.batch([
    db.insert(planningPost).values({
      id,
      monthId: current.id,
      position: await nextPostPosition(db, current.id),
      ...fields,
      ...(status ? { status } : {}),
    }),
    ...(plan.changed ? artChangeQueries(db, id, plan, ctx.actor.id) : []),
  ]);
  achievementsAfter("post criado", (database) =>
    onPlanningPostsAdded(database, { planningId: found.planning.id, monthId: current.id, month, actorId: ctx.actor.id, imported: false }),
  );
  refresh();
  return { ok: true, message: "Post criado." };
}

const ART_NEEDS_BRIEF = {
  ok: false,
  error: "Neste planejamento a pauta é aprovada antes: a arte só sobe depois da pauta aprovada.",
} as const;

type PostFields = Omit<z.output<typeof savePostSchema>, "planningId" | "month" | "postId" | "status" | "art" | "approval">;

/**
 * Edita um post. Mudar a pauta aprovada (headline, texto de apoio, slides,
 * roteiro, tipo) ou a arte aprovada tira a aprovação: a primeira tentativa
 * volta com `needsApproval`, e o editor confirma com "drop" (tira) ou, para
 * admins, "keep" (correção pequena, fica no histórico do post). A legenda pode
 * mudar depois da pauta aprovada (o cliente aprova a final junto com a arte).
 */
async function updatePost(
  ctx: Context,
  found: PlanningWithClient,
  post: typeof planningPost.$inferSelect,
  fields: PostFields,
  art: { mediaId: string; role: ArtRole }[] | undefined,
  approval: "keep" | "drop" | undefined,
  /** O que diz o aviso ao salvar ("Post salvo", "Artes salvas"). */
  saved = "Post salvo",
): Promise<PlanningActionResult> {
  const currentArt = (await listPostArt(db, [post.id])).get(post.id) ?? [];
  // Sem `art`, continuam as artes que ainda valem para o tipo.
  const items =
    art ??
    keepValidArt(
      fields.kind,
      currentArt.flatMap((row) => {
        const kind = artMediaKind(row.media?.name ?? row.name);
        return row.mediaId && kind ? [{ mediaId: row.mediaId, role: row.role, kind }] : [];
      }),
    ).map(({ mediaId, role }) => ({ mediaId, role }));
  const plan = await planArtChange(db, { post: { id: post.id, kind: fields.kind, artState: post.artState }, items, actorId: ctx.actor.id });
  if (!plan.ok) return { ok: false, error: plan.error };

  // Com o cliente esperando resposta, o que ele vê fica travado (D11); as observações internas não.
  const visibleChange =
    briefChanged(post, fields) ||
    captionChanged(post, { copy: fields.copy, cta: fields.cta, hashtags: fields.hashtags }) ||
    post.date !== fields.date ||
    post.network !== fields.network ||
    plan.changed;
  if (isWaitingClient(post) && visibleChange) {
    return { ok: false, error: "Este post está com o cliente, esperando resposta. Retire do envio para editar." };
  }

  const briefDrop = post.briefState === "aprovada" && briefChanged(post, fields);
  const artDrop =
    post.artState === "aprovada" &&
    (briefDrop || plan.changed || captionChanged(post, { copy: fields.copy, cta: fields.cta, hashtags: fields.hashtags }));
  const stages: ApprovalStage[] = [...(briefDrop ? (["pauta"] as const) : []), ...(artDrop ? (["arte"] as const) : [])];
  if (stages.length && !approval) {
    return { ok: false, error: "Essa mudança tira a aprovação do cliente.", needsApproval: stages };
  }
  if (stages.length && approval === "keep" && !ctx.isAdmin) {
    return { ok: false, error: "Só admins salvam sem tirar a aprovação." };
  }
  const dropping = stages.length > 0 && approval === "drop";
  const keeping = stages.length > 0 && approval === "keep";
  const briefState = dropping && briefDrop ? "rascunho" : post.briefState;
  if (plan.insert.length && !canUploadArt(found.planning, { briefState, hasArt: currentArt.length > 0 })) return ART_NEEDS_BRIEF;

  const set: Partial<typeof planningPost.$inferInsert> = { ...fields };
  if (dropping) {
    if (briefDrop) {
      Object.assign(set, { briefState: "rascunho", briefDecidedAt: null, briefDecidedByName: null, briefDecidedBySide: null, briefCaption: null });
    }
    if (artDrop) {
      Object.assign(set, { artState: plan.count ? "pronta" : "sem_arte", artDecidedAt: null, artDecidedByName: null, artDecidedBySide: null });
    }
    if (post.status !== "producao") Object.assign(set, { status: "producao", statusChangedAt: new Date() });
  }
  // Mantendo a aprovação (admin), a arte trocada continua aprovada.
  const artPlan = keeping && artDrop ? { ...plan, artState: post.artState } : plan;

  // O histórico do post importa a partir do momento em que algo foi decidido ou foi ao cliente.
  const tracked = post.briefState !== "rascunho" || isArtShared(post.artState);
  const events: PlanningPostEventData[] = [
    ...(dropping ? [{ type: "approval_removed" as const, stages }] : []),
    ...(keeping ? [{ type: "approval_kept" as const, stages }] : []),
    ...(tracked && post.date !== fields.date ? [{ type: "date_changed" as const, from: post.date, to: fields.date }] : []),
    ...(tracked && post.network !== fields.network ? [{ type: "network_changed" as const, from: post.network, to: fields.network }] : []),
  ];

  await db.batch([
    db.update(planningPost).set(set).where(eq(planningPost.id, post.id)),
    ...(plan.changed ? artChangeQueries(db, post.id, artPlan, ctx.actor.id) : []),
    ...(events.length
      ? [db.insert(planningPostEvent).values(events.map((data) => postEventValues({ postId: post.id, data, actor: ctx.actor })))]
      : []),
  ]);
  await removeArtFiles(plan.removedMediaIds, ctx);
  refresh();
  return { ok: true, message: dropping ? `${saved}. O post volta para ser enviado ao cliente.` : `${saved}.` };
}

/**
 * Só as artes de um post (o botão "Adicionar arte" do card): o mesmo caminho de
 * salvar o post, com o texto como está. Valem as mesmas regras (pauta aprovada
 * antes, post com o cliente travado, confirmação ao trocar uma arte aprovada).
 */
export async function savePostArt(input: SavePostArtInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = savePostArtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Artes inválidas." };
  const existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };
  const found = await findPlanningById(db, existing.month.planningId);
  if (!found) return NOT_FOUND;

  const { post } = existing;
  const fields: PostFields = {
    date: post.date,
    network: post.network,
    kind: post.kind,
    headline: post.headline,
    supportText: post.supportText,
    copy: post.copy,
    cta: post.cta,
    hashtags: post.hashtags,
    slides: post.slides,
    scenes: post.scenes,
  };
  return updatePost(ctx, found, post, fields, parsed.data.art, parsed.data.approval, "Artes salvas");
}

export async function deletePost(input: { postId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = postTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Post inválido." };
  const existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };

  const artFiles = await listArtMediaIds(db, { postIds: [existing.post.id] });
  await db.delete(planningPost).where(eq(planningPost.id, existing.post.id));
  // O envio em que o post esperava o cliente segue sem ele (e fecha, se era o último).
  await closeEmptySends(db, existing.month.id);
  await removeArtFiles(artFiles, ctx);
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
  const artFiles = await listArtMediaIds(db, { monthId: current.id });
  const removed = await db.delete(planningPost).where(eq(planningPost.monthId, current.id)).returning({ id: planningPost.id });
  await removeArtFiles(artFiles, ctx);
  await recordAudit({
    action: "planning.posts_deleted",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month: parsed.data.month, posts: removed.length, artFiles: artFiles.length },
    ...ctx.meta,
  });
  refresh();
  return { ok: true, message: `${removed.length} ${removed.length === 1 ? "post excluído" : "posts excluídos"}.` };
}

/**
 * Muda o status do post à mão. Nos planejamentos com "Aprovar pauta", o
 * seletor tem a etapa ("Pauta ·"/"Arte ·"): passar para a arte registra a
 * pauta como aprovada pela equipe; voltar para a pauta desfaz a aprovação
 * (só enquanto a arte não foi ao cliente). Mudar de etapa é só para admins.
 */
export async function setPostStatus(input: { postId: string; status: PlanningStatus; stage?: "pauta" | "arte" }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = setPostStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  let existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };
  const found = await findPlanningById(db, existing.month.planningId);
  if (!found) return NOT_FOUND;

  const { stage } = parsed.data;
  const currentStage = postStageOf(found.planning, existing.post);
  if (stage && currentStage && stage !== currentStage) {
    if (!ctx.isAdmin) return { ok: false, error: "Só admins mudam a etapa do post." };
    if (stage === "arte") {
      // A pauta passa a aprovada pela equipe (fecha o envio da pauta, se esperava o cliente).
      await registerTeamDecisions(db, { postIds: [existing.post.id], stage: "pauta", decision: "approved", comment: null, actor: ctx.actor });
      await recordAudit({
        action: "planning.decision_registered",
        actor: ctx.actor,
        entity: planningEntity(found),
        metadata: { months: [existing.month.month], stage: "pauta", decision: "approved", posts: 1 },
        ...ctx.meta,
      });
    } else {
      if (isArtShared(existing.post.artState)) return { ok: false, error: "A arte já foi ao cliente: o post não volta para a pauta." };
      await undoBriefApproval(db, { postId: existing.post.id, actor: ctx.actor });
    }
    existing = (await findPlanningPost(db, existing.post.id))!;
  }
  if (existing.post.status === parsed.data.status) {
    refresh();
    return { ok: true, message: stage && stage !== currentStage ? "Etapa do post atualizada." : "O post já está nesse status." };
  }

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
  const shown = postStatusValue(postStageOf(found.planning, existing.post), parsed.data.status);
  return { ok: true, message: `Post: ${postStatusLabel(shown).label}.` };
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

/** Registra a aprovação da pauta em nome do cliente (ele aprovou por fora), num post ou em vários. Só admins. */
export async function approvePostBriefs(input: { planningId: string; postIds: string[] }): Promise<PlanningActionResult> {
  return registerClientDecision({ ...input, stage: "pauta", decision: "approved", comment: null });
}

/**
 * Registra a resposta do cliente (aprovar ou pedir alteração, com o que mudar)
 * quando ele respondeu por fora, num post ou em vários, numa etapa (D13). Só
 * admins. Se o post esperava o cliente nessa etapa, o envio dele fecha com essa
 * resposta. Avisa os responsáveis, não o portal.
 */
export async function registerClientDecision(input: RegisterDecisionInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.isAdmin) return { ok: false, error: "Só admins registram a resposta do cliente." };
  const parsed = registerDecisionSchema.safeParse(input);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { ok: false, error: errors.comment?.[0] ?? parsed.error.issues[0]?.message ?? "Resposta inválida.", fieldErrors: errors };
  }
  const { stage, decision, comment } = parsed.data;
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;
  if (stage === "pauta" && !found.planning.approvesBrief) return { ok: false, error: "Este planejamento não tem aprovação de pauta." };

  const mine = await db
    .select({ id: planningPost.id, month: planningMonth.month, artState: planningPost.artState })
    .from(planningPost)
    .innerJoin(planningMonth, eq(planningMonth.id, planningPost.monthId))
    .where(and(eq(planningMonth.planningId, found.planning.id), inArray(planningPost.id, parsed.data.postIds)));
  // Arte só se responde com arte.
  const eligible = stage === "arte" ? mine.filter((post) => post.artState !== "sem_arte") : mine;
  if (eligible.length === 0) return { ok: false, error: stage === "arte" ? "Esses posts ainda não têm arte." : "Post não encontrado." };
  const { posts, outcome } = await registerTeamDecisions(db, {
    postIds: eligible.map((post) => post.id),
    stage,
    decision,
    comment,
    actor: ctx.actor,
  });
  if (posts.length === 0) return { ok: true, message: "Nada mudou: os posts já estavam com essa resposta." };

  const months = [...new Set(eligible.map((post) => post.month))];
  await recordAudit({
    action: "planning.decision_registered",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { months, stage, decision, posts: posts.length },
    ...ctx.meta,
  });
  for (const month of months) {
    notifyPlanningAnswered({
      planning: notifyTarget(found),
      actor: ctx.actor,
      month,
      approved: decision === "approved" ? posts.length : 0,
      changes: decision === "changes" ? posts.length : 0,
      note: null,
    });
  }
  trackMonthChanges(outcome);
  refresh();
  const what = stage === "pauta" ? (posts.length === 1 ? "Pauta" : "Pautas") : posts.length === 1 ? "Arte" : "Artes";
  const count = posts.length === 1 ? "" : ` de ${posts.length} posts`;
  if (decision === "changes") return { ok: true, message: `Alteração registrada${count}.` };
  return {
    ok: true,
    message:
      stage === "pauta"
        ? `${what}${count} ${posts.length === 1 ? "aprovada" : "aprovadas"}. Já dá para subir ${posts.length === 1 ? "a arte" : "as artes"}.`
        : `${what}${count} ${posts.length === 1 ? "aprovada" : "aprovadas"}.`,
  };
}

/** O mês que andou por causa de respostas ("Aprovado" sem ajustes vale a conquista "Aprovado de Primeira"). */
function trackMonthChanges(outcome: DecisionOutcome) {
  for (const month of outcome.months) {
    achievementsAfter("status do mês", (database) =>
      onPlanningMonthStatus(database, {
        planningId: month.planningId,
        monthId: month.monthId,
        month: month.month,
        previous: month.previous,
        next: month.next,
        adjustmentsRequestedAt: month.adjustmentsRequestedAt,
      }),
    );
  }
}

/**
 * Manda a pauta ou as artes de posts do mês ao cliente (toda a equipe). Só vão
 * os que podem ir agora; o mês aparece no portal, os contatos são avisados no
 * sino e quem aprova recebe o e-mail.
 */
export async function sendForApproval(input: SendForApprovalInput): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = sendForApprovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Envio inválido." };
  const { month, stage } = parsed.data;
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;
  if (found.client.archivedAt) return { ok: false, error: "O cliente está arquivado: o portal dele está fechado." };
  if (stage === "pauta" && !found.planning.approvesBrief) return { ok: false, error: "Este planejamento não tem aprovação de pauta." };
  const current = await findPlanningMonth(db, found.planning.id, month);
  if (!current) return { ok: false, error: "O mês ainda não tem posts." };

  const sent = await createSend(db, {
    planning: found.planning,
    monthId: current.id,
    stage,
    postIds: parsed.data.postIds,
    note: sanitizeRichText(parsed.data.note),
    actor: ctx.actor,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  await recordAudit({
    action: "planning.sent",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month, stage, posts: sent.posts },
    ...ctx.meta,
  });
  notifyPortalPlanning({
    clientId: found.client.id,
    clientName: found.client.name,
    monthId: current.id,
    month,
    stage,
    posts: sent.posts,
    actor: ctx.actor,
  });
  refresh();
  const posts = `${sent.posts} ${sent.posts === 1 ? "post" : "posts"}`;
  return { ok: true, message: stage === "pauta" ? `Pauta de ${posts} enviada ao cliente.` : `Artes de ${posts} enviadas ao cliente.` };
}

/** Retira um envio inteiro (só enquanto o cliente não mandou nenhuma resposta dele). */
export async function withdrawPlanningSend(input: { planningId: string; month: string; sendId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = sendTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Envio inválido." };
  const found = await findPlanningById(db, parsed.data.planningId);
  if (!found) return NOT_FOUND;
  const current = await findPlanningMonth(db, found.planning.id, parsed.data.month);
  if (!current) return { ok: false, error: "Envio não encontrado." };

  const result = await withdrawSend(db, { sendId: parsed.data.sendId, monthId: current.id, actor: ctx.actor });
  if (!result.ok) return result;
  await recordAudit({
    action: "planning.send_withdrawn",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month: parsed.data.month, stage: result.stage, posts: result.posts },
    ...ctx.meta,
  });
  refresh();
  return { ok: true, message: "Envio retirado: o cliente não vê mais esses posts como para aprovar." };
}

/** Tira um post do envio para a equipe editar (D11); o resto do envio continua com o cliente. */
export async function withdrawPostForEditing(input: { postId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = postTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Post inválido." };
  const existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };

  const result = await withdrawPostFromSend(db, { postId: existing.post.id, actor: ctx.actor });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Post retirado do envio. Já dá para editar." };
}

/** Desfaz a aprovação da pauta registrada por engano. Só admins, e só enquanto a arte não foi ao cliente. */
export async function undoPostBriefApproval(input: { postId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.isAdmin) return { ok: false, error: "Só admins desfazem a aprovação da pauta." };
  const parsed = postTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Post inválido." };
  const existing = await findPlanningPost(db, parsed.data.postId);
  if (!existing) return { ok: false, error: "Post não encontrado." };
  const found = await findPlanningById(db, existing.month.planningId);
  if (!found) return NOT_FOUND;

  if (!(await undoBriefApproval(db, { postId: existing.post.id, actor: ctx.actor }))) {
    return { ok: false, error: "A pauta deste post não está aprovada, ou a arte já foi ao cliente." };
  }
  await recordAudit({
    action: "planning.brief_approval_undone",
    actor: ctx.actor,
    entity: planningEntity(found),
    metadata: { month: existing.month.month, headline: existing.post.headline || null },
    ...ctx.meta,
  });
  refresh();
  return { ok: true, message: "A pauta voltou para rascunho." };
}

/** Tira do editor uma arte enviada e ainda não salva no post: apaga do CDN. */
export async function discardArtUpload(input: { mediaId: string }): Promise<PlanningActionResult> {
  const ctx = await getContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = mediaTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido." };
  const file = await findMediaById(db, parsed.data.mediaId);
  if (!file || file.uploadedById !== ctx.actor.id || file.folder !== "planejamentos") return { ok: false, error: "Arquivo inválido." };
  const [attached] = await db
    .select({ id: planningPostAsset.id })
    .from(planningPostAsset)
    .where(eq(planningPostAsset.mediaId, file.id))
    .limit(1);
  // Já é arte de um post (salvo em outra aba, por exemplo): fica.
  if (attached) return { ok: true, message: "A arte continua no post." };
  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta, audit: false });
  return result.ok ? { ok: true, message: "Arte removida." } : { ok: false, error: result.error };
}
