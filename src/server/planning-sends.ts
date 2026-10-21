import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type { Database } from "@/db";
import {
  client,
  media,
  planning,
  planningAnswer,
  planningMonth,
  planningPost,
  planningPostAsset,
  planningPostEvent,
  planningReview,
  planningSend,
  planningSendPost,
} from "@/db/schema";
import {
  canSendStage,
  statusAfterDecision,
  type ApprovalStage,
  type ArtState,
  type BriefState,
  type DecisionSide,
  type PlanningStatus,
  type ReviewDecision,
} from "@/lib/planning";
import { postEventValues, type PostArtRow } from "./planning-approvals";

// Envios ao cliente e as respostas dele (docs/planejamentos-no-portal.md, Fase C).
// Sem "server-only": rodam também nos scripts de verificação contra PGlite. O
// driver neon-http não tem transação: as gravações vão em sequência, cada uma
// condicionada à situação esperada (ex.: só responde um post que ainda espera),
// para duas abas ou dois contatos não pisarem um no outro.

type Actor = { id: string; name: string };
type PostRow = typeof planningPost.$inferSelect;

/** Os posts que esperam o cliente no mês: post → envio pendente de cada etapa. */
export async function listPendingSendPosts(database: Database, monthId: string) {
  const rows = await database
    .select({
      id: planningSendPost.id,
      postId: planningSendPost.postId,
      stage: planningSendPost.stage,
      sendId: planningSendPost.sendId,
      sentAt: planningSend.sentAt,
      sentByName: planningSend.sentByName,
    })
    .from(planningSendPost)
    .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
    .where(and(eq(planningSend.monthId, monthId), eq(planningSendPost.state, "pending")));
  return rows;
}

/** Os envios pendentes do mês, com quantos posts e se o cliente já mandou alguma resposta (aí não dá para retirar inteiro). */
export async function listPendingSends(database: Database, monthId: string) {
  const sends = await database
    .select()
    .from(planningSend)
    .where(and(eq(planningSend.monthId, monthId), eq(planningSend.status, "pending")))
    .orderBy(asc(planningSend.sentAt));
  if (sends.length === 0) return [];
  const posts = await database
    .select({ sendId: planningSendPost.sendId, state: planningSendPost.state })
    .from(planningSendPost)
    .where(inArray(planningSendPost.sendId, sends.map((send) => send.id)));
  return sends.map((send) => {
    const mine = posts.filter((post) => post.sendId === send.id);
    return {
      ...send,
      total: mine.filter((post) => post.state !== "withdrawn").length,
      waiting: mine.filter((post) => post.state === "pending").length,
      answered: mine.filter((post) => post.state === "answered").length,
    };
  });
}

export type PendingSend = Awaited<ReturnType<typeof listPendingSends>>[number];

/** A maior versão de arte de cada post (a atual). */
async function currentArtVersions(database: Database, postIds: string[]) {
  const map = new Map<string, number>();
  if (postIds.length === 0) return map;
  const rows = await database
    .select({ postId: planningPostAsset.postId, version: sql<number>`max(${planningPostAsset.version})`.mapWith(Number) })
    .from(planningPostAsset)
    .where(inArray(planningPostAsset.postId, postIds))
    .groupBy(planningPostAsset.postId);
  for (const row of rows) map.set(row.postId, row.version);
  return map;
}

/**
 * Manda posts do mês ao cliente numa etapa. Só vão os que podem ir agora
 * (canSendStage) e não estão num envio pendente dessa etapa. O post vai para
 * "Aguardando aprovação"; o mês também (menos se já foi finalizado) e passa a
 * aparecer no portal (`sharedAt`).
 */
export async function createSend(
  database: Database,
  input: {
    planning: { approvesBrief: boolean };
    monthId: string;
    stage: ApprovalStage;
    postIds: string[];
    note: string | null;
    actor: Actor;
    now?: Date;
  },
): Promise<{ ok: false; error: string } | { ok: true; sendId: string; posts: number; month: { previous: PlanningStatus; next: PlanningStatus } }> {
  const now = input.now ?? new Date();
  const [month] = await database.select().from(planningMonth).where(eq(planningMonth.id, input.monthId)).limit(1);
  if (!month) return { ok: false, error: "Mês não encontrado." };
  const posts = input.postIds.length
    ? await database
        .select()
        .from(planningPost)
        .where(and(eq(planningPost.monthId, month.id), inArray(planningPost.id, input.postIds)))
    : [];
  const versions = await currentArtVersions(database, posts.map((post) => post.id));
  const pending = new Set(
    (await listPendingSendPosts(database, month.id)).filter((row) => row.stage === input.stage).map((row) => row.postId),
  );
  const chosen = posts.filter(
    (post) => !pending.has(post.id) && canSendStage(input.planning, { ...post, hasArt: versions.has(post.id) }, input.stage),
  );
  if (chosen.length === 0) return { ok: false, error: "Nenhum dos posts escolhidos pode ir ao cliente agora." };

  const [send] = await database
    .insert(planningSend)
    .values({ monthId: month.id, stage: input.stage, note: input.note, sentById: input.actor.id, sentByName: input.actor.name, sentAt: now })
    .returning({ id: planningSend.id });
  try {
    await database.insert(planningSendPost).values(
      chosen.map((post) => ({
        sendId: send.id,
        postId: post.id,
        stage: input.stage,
        previousState: input.stage === "pauta" ? post.briefState : post.artState,
        artVersion: input.stage === "arte" ? (versions.get(post.id) ?? null) : null,
      })),
    );
  } catch (error) {
    // Outro envio levou um destes posts no meio do caminho (índice único dos pendentes).
    console.error(error);
    await database.delete(planningSend).where(eq(planningSend.id, send.id));
    return { ok: false, error: "Um dos posts acabou de ir ao cliente em outro envio. Recarregue a página." };
  }

  const ids = chosen.map((post) => post.id);
  await database
    .update(planningPost)
    .set({
      ...(input.stage === "pauta" ? { briefState: "enviada" as const } : { artState: "enviada" as const }),
      status: sql`case when ${planningPost.status} = 'finalizado' then ${planningPost.status} else 'aprovacao' end`,
      statusChangedAt: sql`case when ${planningPost.status} in ('finalizado', 'aprovacao') then ${planningPost.statusChangedAt} else ${now.toISOString()}::timestamptz end`,
    })
    .where(inArray(planningPost.id, ids));
  // Algo novo foi ao cliente: o mês volta a esperar a aprovação (mesmo se já estava aprovado); finalizado fica.
  const next: PlanningStatus = month.status === "finalizado" ? month.status : "aprovacao";
  await database
    .update(planningMonth)
    .set({
      sharedAt: month.sharedAt ?? now,
      ...(next !== month.status ? { status: next, statusChangedAt: now } : {}),
    })
    .where(eq(planningMonth.id, month.id));
  await database
    .insert(planningPostEvent)
    .values(ids.map((postId) => ({ ...postEventValues({ postId, data: { type: "sent", stage: input.stage }, actor: input.actor }), createdAt: now })));
  return { ok: true, sendId: send.id, posts: chosen.length, month: { previous: month.status, next } };
}

/** Desfaz o envio de posts que ainda esperam: a situação volta à de antes e os rascunhos do cliente somem. */
async function withdrawSendPosts(database: Database, rows: { id: string; postId: string; stage: ApprovalStage; previousState: string }[], actor: Actor) {
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  await database.delete(planningReview).where(and(inArray(planningReview.sendPostId, ids), isNull(planningReview.submittedAt)));
  const withdrawn = await database
    .update(planningSendPost)
    .set({ state: "withdrawn" })
    .where(and(inArray(planningSendPost.id, ids), eq(planningSendPost.state, "pending")))
    .returning({ id: planningSendPost.id });
  const done = new Set(withdrawn.map((row) => row.id));
  for (const row of rows.filter((item) => done.has(item.id))) {
    const back = row.previousState === "alteracoes" ? ("ajustes" as const) : ("producao" as const);
    await database
      .update(planningPost)
      .set({
        ...(row.stage === "pauta" ? { briefState: row.previousState as BriefState } : { artState: row.previousState as ArtState }),
        status: sql`case when ${planningPost.status} = 'aprovacao' then ${back} else ${planningPost.status} end`,
      })
      .where(
        and(
          eq(planningPost.id, row.postId),
          row.stage === "pauta" ? eq(planningPost.briefState, "enviada") : eq(planningPost.artState, "enviada"),
        ),
      );
    await database.insert(planningPostEvent).values(postEventValues({ postId: row.postId, data: { type: "withdrawn", stage: row.stage }, actor }));
  }
}

/** Fecha os envios que não têm mais post esperando: respondido se algum foi respondido, senão retirado. */
async function closeFinishedSends(database: Database, sendIds: string[], now: Date) {
  for (const sendId of new Set(sendIds)) {
    const rows = await database
      .select({ state: planningSendPost.state })
      .from(planningSendPost)
      .where(eq(planningSendPost.sendId, sendId));
    if (rows.some((row) => row.state === "pending")) continue;
    const answered = rows.some((row) => row.state === "answered");
    await database
      .update(planningSend)
      .set(answered ? { status: "answered", answeredAt: now } : { status: "withdrawn" })
      .where(and(eq(planningSend.id, sendId), eq(planningSend.status, "pending")));
  }
}

/** Fecha os envios pendentes do mês que ficaram sem post esperando (ex.: o post foi excluído). */
export async function closeEmptySends(database: Database, monthId: string) {
  const sends = await database
    .select({ id: planningSend.id })
    .from(planningSend)
    .where(and(eq(planningSend.monthId, monthId), eq(planningSend.status, "pending")));
  await closeFinishedSends(database, sends.map((send) => send.id), new Date());
}

/** Retira um envio inteiro: só enquanto o cliente não mandou nenhuma resposta dele. */
export async function withdrawSend(database: Database, input: { sendId: string; monthId: string; actor: Actor }) {
  const [send] = await database
    .select()
    .from(planningSend)
    .where(and(eq(planningSend.id, input.sendId), eq(planningSend.monthId, input.monthId)))
    .limit(1);
  if (!send || send.status !== "pending") return { ok: false as const, error: "Este envio não está mais esperando o cliente." };
  const rows = await database.select().from(planningSendPost).where(eq(planningSendPost.sendId, send.id));
  if (rows.some((row) => row.state === "answered")) {
    return { ok: false as const, error: "O cliente já respondeu parte deste envio. Retire os posts que faltam um a um." };
  }
  await withdrawSendPosts(database, rows.filter((row) => row.state === "pending"), input.actor);
  await closeFinishedSends(database, [send.id], new Date());
  return { ok: true as const, stage: send.stage, posts: rows.filter((row) => row.state === "pending").length };
}

/** Retira um post do envio (para a equipe editar): o resto do envio continua com o cliente. */
export async function withdrawPostFromSend(database: Database, input: { postId: string; actor: Actor }) {
  const rows = await database
    .select()
    .from(planningSendPost)
    .where(and(eq(planningSendPost.postId, input.postId), eq(planningSendPost.state, "pending")));
  if (rows.length === 0) return { ok: false as const, error: "Este post não está esperando o cliente." };
  await withdrawSendPosts(database, rows, input.actor);
  await closeFinishedSends(database, rows.map((row) => row.sendId), new Date());
  return { ok: true as const };
}

export type DecisionInput = {
  postId: string;
  stage: ApprovalStage;
  decision: ReviewDecision;
  comment: string | null;
  /** O post do envio que a resposta fecha (null: a equipe registrou sem envio pendente). */
  sendPostId: string | null;
  /** Rascunho do cliente que vira resposta enviada (senão, uma resposta nova é gravada). */
  draftId?: string;
};

export type DecisionOutcome = {
  approved: number;
  changes: number;
  months: { monthId: string; planningId: string; month: string; previous: PlanningStatus; next: PlanningStatus; adjustmentsRequestedAt: Date | null }[];
};

const captionSnapshot = sql`jsonb_build_object('copy', ${planningPost.copy}, 'cta', ${planningPost.cta}, 'hashtags', to_jsonb(${planningPost.hashtags}))`;

/**
 * Grava respostas (do cliente ou registradas pela equipe) e tira as
 * consequências: o post do envio fecha, a etapa do post fica aprovada ou com
 * alteração pedida, o status do post anda (D3), os envios sem nada esperando
 * fecham e o mês anda: "Ajustes pedidos" com alguma alteração, "Aprovado"
 * quando todos os posts têm a arte aprovada.
 */
export async function applyDecisions(
  database: Database,
  input: {
    decisions: DecisionInput[];
    side: DecisionSide;
    by: { userId?: string | null; portalUserId?: string | null; name: string };
    now?: Date;
  },
): Promise<DecisionOutcome> {
  const now = input.now ?? new Date();
  const outcome: DecisionOutcome = { approved: 0, changes: 0, months: [] };
  if (input.decisions.length === 0) return outcome;
  const posts = await database.select().from(planningPost).where(inArray(planningPost.id, input.decisions.map((item) => item.postId)));
  const byId = new Map(posts.map((post) => [post.id, post]));
  const sendIds: string[] = [];
  const monthIds = new Set<string>();
  const monthsWithChanges = new Set<string>();

  for (const item of input.decisions) {
    const post = byId.get(item.postId);
    if (!post) continue;
    if (item.sendPostId) {
      // Só responde o que ainda espera (outra aba ou outro contato pode ter respondido antes).
      const [closed] = await database
        .update(planningSendPost)
        .set({ state: "answered", answeredAt: now })
        .where(and(eq(planningSendPost.id, item.sendPostId), eq(planningSendPost.state, "pending")))
        .returning({ sendId: planningSendPost.sendId });
      if (!closed) continue;
      sendIds.push(closed.sendId);
    }
    const comment = item.decision === "changes" ? item.comment : null;
    if (item.draftId) {
      await database
        .update(planningReview)
        .set({ decision: item.decision, comment, submittedAt: now })
        .where(and(eq(planningReview.id, item.draftId), isNull(planningReview.submittedAt)));
    } else {
      const [sendPost] = item.sendPostId
        ? await database.select({ sendId: planningSendPost.sendId }).from(planningSendPost).where(eq(planningSendPost.id, item.sendPostId))
        : [];
      // Rascunhos que sobraram deste post do envio deixam de valer.
      if (item.sendPostId) {
        await database.delete(planningReview).where(and(eq(planningReview.sendPostId, item.sendPostId), isNull(planningReview.submittedAt)));
      }
      await database.insert(planningReview).values({
        postId: post.id,
        sendId: sendPost?.sendId ?? null,
        sendPostId: item.sendPostId,
        stage: item.stage,
        decision: item.decision,
        comment,
        side: input.side,
        userId: input.by.userId ?? null,
        portalUserId: input.by.portalUserId ?? null,
        name: input.by.name,
        createdAt: now,
        submittedAt: now,
      });
    }

    const decided = { at: now, name: input.by.name, side: input.side };
    const status = statusAfterDecision(post.status, item.stage, item.decision);
    const state = item.decision === "approved" ? "aprovada" : "alteracoes";
    await database
      .update(planningPost)
      .set({
        ...(item.stage === "pauta"
          ? {
              briefState: state,
              briefDecidedAt: decided.at,
              briefDecidedByName: decided.name,
              briefDecidedBySide: decided.side,
              ...(item.decision === "approved" ? { briefCaption: captionSnapshot } : {}),
            }
          : { artState: state, artDecidedAt: decided.at, artDecidedByName: decided.name, artDecidedBySide: decided.side }),
        ...(status !== post.status ? { status, statusChangedAt: now } : {}),
      })
      .where(eq(planningPost.id, post.id));
    if (item.decision === "approved") outcome.approved += 1;
    else {
      outcome.changes += 1;
      monthsWithChanges.add(post.monthId);
    }
    monthIds.add(post.monthId);
  }

  await closeFinishedSends(database, sendIds, now);
  for (const monthId of monthIds) {
    const [month] = await database
      .select({ month: planningMonth, planningId: planningMonth.planningId })
      .from(planningMonth)
      .where(eq(planningMonth.id, monthId));
    if (!month || month.month.status === "finalizado") continue;
    let next: PlanningStatus = month.month.status;
    if (monthsWithChanges.has(monthId)) next = "ajustes";
    else {
      const [left] = await database
        .select({ total: sql<number>`count(*)`.mapWith(Number), notApproved: sql<number>`count(*) filter (where ${planningPost.artState} <> 'aprovada')`.mapWith(Number) })
        .from(planningPost)
        .where(eq(planningPost.monthId, monthId));
      if (left.total > 0 && left.notApproved === 0) next = "aprovado";
      else if (month.month.status === "aprovacao") {
        // Nada mais esperando o cliente e ainda falta arte: a vez é da equipe.
        const [waiting] = await database
          .select({ id: planningSendPost.id })
          .from(planningSendPost)
          .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
          .where(and(eq(planningSend.monthId, monthId), eq(planningSendPost.state, "pending")))
          .limit(1);
        if (!waiting) next = "producao";
      }
    }
    if (next === month.month.status) continue;
    await database
      .update(planningMonth)
      .set({ status: next, statusChangedAt: now, ...(next === "ajustes" ? { adjustmentsRequestedAt: now } : {}) })
      .where(eq(planningMonth.id, monthId));
    outcome.months.push({
      monthId,
      planningId: month.planningId,
      month: month.month.month,
      previous: month.month.status,
      next,
      adjustmentsRequestedAt: month.month.adjustmentsRequestedAt,
    });
  }
  return outcome;
}

/**
 * A equipe registra a resposta do cliente (ele respondeu por fora, D13), num
 * post ou em vários, numa etapa. Se o post estava num envio pendente dessa
 * etapa, o envio dele fecha com essa resposta. Devolve os posts que mudaram.
 */
export async function registerTeamDecisions(
  database: Database,
  input: { postIds: string[]; stage: ApprovalStage; decision: ReviewDecision; comment: string | null; actor: Actor; now?: Date },
) {
  if (input.postIds.length === 0) return { posts: [] as PostRow[], outcome: { approved: 0, changes: 0, months: [] } as DecisionOutcome };
  const posts = await database.select().from(planningPost).where(inArray(planningPost.id, input.postIds));
  // A mesma resposta de novo não muda nada (ex.: aprovar uma pauta já aprovada).
  const target = input.decision === "approved" ? "aprovada" : "alteracoes";
  const changed = posts.filter((post) => (input.stage === "pauta" ? post.briefState : post.artState) !== target);
  const pending = changed.length
    ? await database
        .select({ id: planningSendPost.id, postId: planningSendPost.postId })
        .from(planningSendPost)
        .where(
          and(
            inArray(planningSendPost.postId, changed.map((post) => post.id)),
            eq(planningSendPost.stage, input.stage),
            eq(planningSendPost.state, "pending"),
          ),
        )
    : [];
  const outcome = await applyDecisions(database, {
    decisions: changed.map((post) => ({
      postId: post.id,
      stage: input.stage,
      decision: input.decision,
      comment: input.comment,
      sendPostId: pending.find((row) => row.postId === post.id)?.id ?? null,
    })),
    side: "team",
    by: { userId: input.actor.id, name: input.actor.name },
    now: input.now,
  });
  return { posts: changed, outcome };
}

// Portal

/** O planejamento do cliente (o clientId sai da sessão do contato, nunca da URL). */
export async function findClientPlanning(database: Database, clientId: string) {
  const [found] = await database
    .select({ planning, client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey, instagram: client.instagram } })
    .from(planning)
    .innerJoin(client, eq(client.id, planning.clientId))
    .where(eq(planning.clientId, clientId))
    .limit(1);
  return found ?? null;
}

/** O cliente tem algo do planejamento para ver no portal (algum mês já enviado). */
export async function clientHasSharedPlanning(database: Database, clientId: string) {
  const [row] = await database
    .select({ id: planningMonth.id })
    .from(planningMonth)
    .innerJoin(planning, eq(planning.id, planningMonth.planningId))
    .where(and(eq(planning.clientId, clientId), isNotNull(planningMonth.sharedAt)))
    .limit(1);
  return Boolean(row);
}

/** Os meses que o cliente vê (já enviados), do mais novo para o mais antigo, com quantos posts esperam resposta em cada etapa. */
export async function listSharedMonths(database: Database, planningId: string) {
  const months = await database
    .select()
    .from(planningMonth)
    .where(and(eq(planningMonth.planningId, planningId), isNotNull(planningMonth.sharedAt)))
    .orderBy(desc(planningMonth.month));
  if (months.length === 0) return [];
  const pending = await database
    .select({ monthId: planningSend.monthId, stage: planningSendPost.stage, total: sql<number>`count(*)`.mapWith(Number) })
    .from(planningSendPost)
    .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
    .where(and(inArray(planningSend.monthId, months.map((month) => month.id)), eq(planningSendPost.state, "pending")))
    .groupBy(planningSend.monthId, planningSendPost.stage);
  return months.map((month) => ({
    ...month,
    waiting: {
      pauta: pending.find((row) => row.monthId === month.id && row.stage === "pauta")?.total ?? 0,
      arte: pending.find((row) => row.monthId === month.id && row.stage === "arte")?.total ?? 0,
    },
  }));
}

export type SharedMonth = Awaited<ReturnType<typeof listSharedMonths>>[number];

/**
 * O mês como o cliente vê: só os posts que já foram a ele, cada um na etapa
 * mais adiantada enviada (a arte, se já foi; senão, a pauta), com a versão da
 * arte que foi enviada, o envio pendente, o rascunho de resposta e a última
 * resposta enviada daquela etapa.
 */
export async function loadClientMonth(database: Database, monthId: string) {
  const sendPosts = await database
    .select({ sendPost: planningSendPost, sentAt: planningSend.sentAt, sendNote: planningSend.note })
    .from(planningSendPost)
    .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
    .where(and(eq(planningSend.monthId, monthId), ne(planningSendPost.state, "withdrawn")))
    .orderBy(desc(planningSend.sentAt));
  const postIds = [...new Set(sendPosts.map((row) => row.sendPost.postId))];
  if (postIds.length === 0) return [];
  const [posts, assets, reviews] = await Promise.all([
    database
      .select()
      .from(planningPost)
      .where(inArray(planningPost.id, postIds))
      .orderBy(sql`${planningPost.date} asc nulls last`, asc(planningPost.position), asc(planningPost.createdAt)),
    database
      .select({
        id: planningPostAsset.id,
        postId: planningPostAsset.postId,
        mediaId: planningPostAsset.mediaId,
        name: planningPostAsset.name,
        role: planningPostAsset.role,
        position: planningPostAsset.position,
        version: planningPostAsset.version,
        media: { key: media.key, name: media.name, type: media.type },
      })
      .from(planningPostAsset)
      .leftJoin(media, eq(media.id, planningPostAsset.mediaId))
      .where(inArray(planningPostAsset.postId, postIds)),
    database.select().from(planningReview).where(inArray(planningReview.postId, postIds)).orderBy(asc(planningReview.createdAt)),
  ]);

  return posts.map((post) => {
    const mine = sendPosts.filter((row) => row.sendPost.postId === post.id);
    const art = mine.find((row) => row.sendPost.stage === "arte");
    const stage: ApprovalStage = art ? "arte" : "pauta";
    const latest = mine.find((row) => row.sendPost.stage === stage)!;
    const pending = latest.sendPost.state === "pending" ? latest.sendPost : null;
    const version = art?.sendPost.artVersion ?? null;
    const order = (row: PostArtRow) => (row.role === "cover" ? 1 : 0);
    const artRows: PostArtRow[] =
      version === null
        ? []
        : assets
            .filter((row) => row.postId === post.id && row.version === version)
            .map((row) => ({ ...row, media: row.mediaId ? row.media : null }))
            .sort((a, b) => order(a) - order(b) || a.position - b.position);
    const stageReviews = reviews.filter((review) => review.postId === post.id && review.stage === stage);
    return {
      post,
      stage,
      art: artRows,
      pendingSendPostId: pending?.id ?? null,
      sentAt: latest.sentAt,
      draft: pending ? (stageReviews.find((review) => review.sendPostId === pending.id && !review.submittedAt) ?? null) : null,
      lastAnswer: [...stageReviews].reverse().find((review) => review.submittedAt) ?? null,
      history: reviews.filter((review) => review.postId === post.id && review.submittedAt),
    };
  });
}

export type ClientMonthPost = Awaited<ReturnType<typeof loadClientMonth>>[number];

/** O post do envio, só se for do cliente e ainda esperar resposta. */
export async function findClientPendingSendPost(database: Database, input: { sendPostId: string; clientId: string }) {
  const [found] = await database
    .select({ sendPost: planningSendPost, monthId: planningSend.monthId })
    .from(planningSendPost)
    .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
    .innerJoin(planningMonth, eq(planningMonth.id, planningSend.monthId))
    .innerJoin(planning, eq(planning.id, planningMonth.planningId))
    .where(and(eq(planningSendPost.id, input.sendPostId), eq(planning.clientId, input.clientId), eq(planningSendPost.state, "pending")))
    .limit(1);
  return found ?? null;
}

/**
 * Guarda (ou desfaz, com `decision` null) o rascunho de resposta de um post do
 * envio. Um rascunho por post do envio: qualquer contato que aprova completa ou
 * muda o que o outro marcou. A equipe não vê rascunhos.
 */
export async function saveDraftDecision(
  database: Database,
  input: { sendPostId: string; postId: string; stage: ApprovalStage; decision: ReviewDecision | null; comment: string | null; contact: { id: string; name: string } },
) {
  if (!input.decision) {
    await database.delete(planningReview).where(and(eq(planningReview.sendPostId, input.sendPostId), isNull(planningReview.submittedAt)));
    return;
  }
  const values = {
    postId: input.postId,
    sendPostId: input.sendPostId,
    stage: input.stage,
    decision: input.decision,
    comment: input.decision === "changes" ? input.comment : null,
    side: "client" as const,
    portalUserId: input.contact.id,
    name: input.contact.name,
    createdAt: new Date(),
  };
  await database
    .insert(planningReview)
    .values(values)
    .onConflictDoUpdate({
      target: planningReview.sendPostId,
      targetWhere: sql`submitted_at is null`,
      set: { decision: values.decision, comment: values.comment, portalUserId: values.portalUserId, name: values.name, createdAt: values.createdAt },
    });
}

/**
 * "Enviar respostas": manda à equipe o que já foi respondido do mês (com
 * `approveRest`, aprova antes os que ainda não têm resposta: "Aprovar tudo").
 * O que ficou sem resposta continua esperando. Guarda o recado geral.
 */
export async function submitClientAnswers(
  database: Database,
  input: { monthId: string; contact: { id: string; name: string }; note: string | null; approveRest: boolean; now?: Date },
): Promise<{ ok: false; error: string } | ({ ok: true } & DecisionOutcome)> {
  const now = input.now ?? new Date();
  const pending = await database
    .select({ sendPost: planningSendPost })
    .from(planningSendPost)
    .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
    .where(and(eq(planningSend.monthId, input.monthId), eq(planningSendPost.state, "pending")));
  if (pending.length === 0) return { ok: false, error: "Nada esperando resposta neste mês." };
  const drafts = await database
    .select()
    .from(planningReview)
    .where(and(inArray(planningReview.sendPostId, pending.map((row) => row.sendPost.id)), isNull(planningReview.submittedAt)));

  const decisions = pending.flatMap(({ sendPost }): DecisionInput[] => {
    const draft = drafts.find((item) => item.sendPostId === sendPost.id);
    if (draft) {
      return [{ postId: sendPost.postId, stage: sendPost.stage, decision: draft.decision, comment: draft.comment, sendPostId: sendPost.id, draftId: draft.id }];
    }
    return input.approveRest
      ? [{ postId: sendPost.postId, stage: sendPost.stage, decision: "approved" as const, comment: null, sendPostId: sendPost.id }]
      : [];
  });
  if (decisions.length === 0) return { ok: false, error: "Responda pelo menos um post antes de enviar." };
  if (decisions.some((item) => item.decision === "changes" && !item.comment)) {
    return { ok: false, error: "Diga o que mudar em cada post com alteração pedida." };
  }

  const outcome = await applyDecisions(database, {
    decisions,
    side: "client",
    by: { portalUserId: input.contact.id, name: input.contact.name },
    now,
  });
  if (outcome.approved + outcome.changes === 0) return { ok: false, error: "Essas respostas já tinham sido enviadas. Recarregue a página." };
  await database.insert(planningAnswer).values({
    monthId: input.monthId,
    note: input.note,
    approved: outcome.approved,
    changes: outcome.changes,
    portalUserId: input.contact.id,
    name: input.contact.name,
    createdAt: now,
  });
  return { ok: true, ...outcome };
}

/** Os meses do cliente com algo esperando resposta (o card "Para aprovar" do início do portal). */
export async function listClientPendingPlanning(database: Database, clientId: string) {
  return database
    .select({
      monthId: planningMonth.id,
      month: planningMonth.month,
      stage: planningSendPost.stage,
      posts: sql<number>`count(*)`.mapWith(Number),
      sentAt: sql<Date>`max(${planningSend.sentAt})`.mapWith((value) => new Date(value)),
    })
    .from(planningSendPost)
    .innerJoin(planningSend, eq(planningSend.id, planningSendPost.sendId))
    .innerJoin(planningMonth, eq(planningMonth.id, planningSend.monthId))
    .innerJoin(planning, eq(planning.id, planningMonth.planningId))
    .where(and(eq(planning.clientId, clientId), eq(planningSendPost.state, "pending")))
    .groupBy(planningMonth.id, planningMonth.month, planningSendPost.stage)
    .orderBy(asc(planningMonth.month), asc(planningSendPost.stage));
}

/** Respostas e acontecimentos de cada post (o histórico no editor da equipe). Rascunhos do cliente ficam fora. */
export async function listPostHistory(database: Database, postIds: string[]) {
  if (postIds.length === 0) return { reviews: [], events: [] };
  const [reviews, events] = await Promise.all([
    database
      .select()
      .from(planningReview)
      .where(and(inArray(planningReview.postId, postIds), isNotNull(planningReview.submittedAt)))
      .orderBy(asc(planningReview.createdAt)),
    database.select().from(planningPostEvent).where(inArray(planningPostEvent.postId, postIds)).orderBy(asc(planningPostEvent.createdAt)),
  ]);
  return { reviews, events };
}
