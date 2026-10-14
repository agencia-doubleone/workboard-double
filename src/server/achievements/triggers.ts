import { and, count, eq, sql } from "drizzle-orm";

import type { Database } from "@/db";
import {
  achievementRecord,
  chatMessage,
  job,
  jobMessage,
  planningMember,
  planningMonth,
  planningPost,
} from "@/db/schema";
import {
  businessDaysEndingAt,
  daysBetween,
  saoPauloClock,
  weekdayOf,
  type AchievementId,
} from "@/lib/achievements";
import { shiftMonth } from "@/lib/calendar";
import { messageEffectOf, splitMessageText } from "@/lib/messages";
import { isPlanningCompletion, type PlanningStatus } from "@/lib/planning";
import { listMentionableIds } from "@/server/jobs";
import type { MessageKind } from "@/server/messages";
import { countUnreadNotifications } from "@/server/notifications";
import { listActiveMemberIds } from "@/server/planning";
import {
  addRecords,
  addUnlocks,
  countAgencyCompletions,
  countOpenJobs,
  grantAchievements,
  listCompletions,
  listUnlockedIds,
  reachedGoals,
  type UnlockMap,
} from "./core";

// Regras disparadas pelas ações do servidor (depois de darem certo, em after()).
// Cada função devolve quem desbloqueou o quê, para o aviso em tempo real.

/** Trabalhos concluídos no dia que vale o "Grand Finale". */
export const GRAND_FINALE_COUNT = 1_000;

/**
 * Trabalho concluído (status passou de um que não encerra para um que
 * encerra): conta para os funcionários ativos dele, uma vez por trabalho.
 */
export async function onJobCompleted(database: Database, input: { jobId: string; at?: Date }): Promise<UnlockMap> {
  const at = input.at ?? new Date();
  const unlocks: UnlockMap = new Map();
  const [found] = await database
    .select({ id: job.id, createdAt: job.createdAt, dueDate: job.dueDate })
    .from(job)
    .where(eq(job.id, input.jobId));
  if (!found) return unlocks;
  const assignees = await listMentionableIds(database, found.id);
  if (assignees.length === 0) return unlocks;

  const { day } = saoPauloClock(at);
  const onTime = found.dueDate ? day <= found.dueDate : null;
  const [already] = await database
    .select({ refId: achievementRecord.refId })
    .from(achievementRecord)
    .where(and(eq(achievementRecord.kind, "job.completed"), eq(achievementRecord.refId, found.id)))
    .limit(1);
  const credited = await addRecords(
    database,
    assignees.map((userId) => ({ userId, kind: "job.completed" as const, refId: found.id, occurredAt: at, onTime })),
  );
  // O trabalho de número 1.000 é o que entra agora pela primeira vez e fecha a conta.
  const grandFinale = !already && credited.length > 0 && (await countAgencyCompletions(database)) === GRAND_FINALE_COUNT;

  for (const { userId } of credited) {
    const unlocked = await listUnlockedIds(database, userId);
    const ids: AchievementId[] = await reachedGoals(database, { userId, isAdmin: false, now: at, unlocked }, ["jobsCompleted"]);
    const history = await listCompletions(database, userId);
    const days = history.map((row) => saoPauloClock(row.occurredAt).day);
    if (days.filter((value) => value === day).length >= 5) ids.push("the-flash");
    const streak = businessDaysEndingAt(day, 5);
    const worked = new Set(days);
    if (streak.length === 5 && streak.every((value) => worked.has(value))) ids.push("em-chamas");
    // "Seguidos no prazo": os 10 últimos com data de entrega (os sem data não contam nem quebram).
    const dated = history.filter((row) => row.onTime !== null).slice(0, 10);
    if (dated.length === 10 && dated.every((row) => row.onTime)) ids.push("pontual");
    if (found.dueDate && daysBetween(found.dueDate, day) > 30) ids.push("antes-tarde-do-que-nunca");
    if (saoPauloClock(found.createdAt).day === day) ids.push("expresso");
    if (weekdayOf(day) === 5) ids.push("sextou");
    if (grandFinale) ids.push("grand-finale");
    if (!unlocked.has("missao-cumprida") && (await countOpenJobs(database, userId)) === 0) ids.push("missao-cumprida");
    addUnlocks(unlocks, userId, await grantAchievements(database, userId, ids.filter((id) => !unlocked.has(id))));
  }
  return unlocks;
}

// Planejamentos (contam para os responsáveis ativos).

/** Status do mês mudou. `adjustmentsRequestedAt` é o valor de antes da troca. */
export async function onPlanningMonthStatus(
  database: Database,
  input: {
    planningId: string;
    monthId: string;
    month: string;
    previous: PlanningStatus;
    next: PlanningStatus;
    adjustmentsRequestedAt: Date | null;
    at?: Date;
  },
): Promise<UnlockMap> {
  const at = input.at ?? new Date();
  const unlocks: UnlockMap = new Map();
  const members = await listActiveMemberIds(database, input.planningId);
  if (members.length === 0) return unlocks;

  if (input.next === "aprovado" && input.previous !== "finalizado" && !input.adjustmentsRequestedAt) {
    for (const userId of members) {
      addUnlocks(unlocks, userId, await grantAchievements(database, userId, ["aprovado-de-primeira"]));
    }
  }

  if (isPlanningCompletion(input.previous, input.next)) {
    const credited = await addRecords(
      database,
      members.map((userId) => ({ userId, kind: "planning.finalized" as const, refId: input.monthId, occurredAt: at })),
    );
    for (const { userId } of credited) {
      const unlocked = await listUnlockedIds(database, userId);
      const ids = await reachedGoals(database, { userId, isAdmin: false, now: at, unlocked }, ["monthsFinalized"]);
      if (!unlocked.has("fechou-o-mes") && (await closedMonthEverywhere(database, userId, input.month))) {
        ids.push("fechou-o-mes");
      }
      addUnlocks(unlocks, userId, await grantAchievements(database, userId, ids));
    }
  }
  return unlocks;
}

/** O mês está finalizado em todos os planejamentos da pessoa (e ela cuida de pelo menos 3)? */
async function closedMonthEverywhere(database: Database, userId: string, month: string) {
  const [row] = await database
    .select({
      total: count(),
      done: sql<number>`count(*) filter (where ${planningMonth.status} = 'finalizado')`.mapWith(Number),
    })
    .from(planningMember)
    .leftJoin(planningMonth, and(eq(planningMonth.planningId, planningMember.planningId), eq(planningMonth.month, month)))
    .where(eq(planningMember.userId, userId));
  return row.total >= 3 && row.done === row.total;
}

/** Entraram como responsáveis (ao criar ou editar o planejamento). */
export async function onPlanningMembersAdded(
  database: Database,
  input: { userIds: string[]; at?: Date },
): Promise<UnlockMap> {
  const at = input.at ?? new Date();
  const unlocks: UnlockMap = new Map();
  for (const userId of input.userIds) {
    const unlocked = await listUnlockedIds(database, userId);
    const ids: AchievementId[] = ["o-estrategista"];
    ids.push(...(await reachedGoals(database, { userId, isAdmin: false, now: at, unlocked }, ["planningsResponsible"])));
    addUnlocks(unlocks, userId, await grantAchievements(database, userId, ids.filter((id) => !unlocked.has(id))));
  }
  return unlocks;
}

/** Posts novos num mês (criados um a um ou importados do JSON). */
export async function onPlanningPostsAdded(
  database: Database,
  input: { planningId: string; monthId: string; month: string; actorId: string; imported: boolean; at?: Date },
): Promise<UnlockMap> {
  const at = input.at ?? new Date();
  const unlocks: UnlockMap = new Map();
  if (input.imported) {
    addUnlocks(unlocks, input.actorId, await grantAchievements(database, input.actorId, ["ctrl-c-ctrl-v"]));
  }
  const members = await listActiveMemberIds(database, input.planningId);
  if (members.length === 0) return unlocks;
  const ids: AchievementId[] = [];
  // Em outubro, posts de dezembro em diante.
  if (input.month >= shiftMonth(saoPauloClock(at).day.slice(0, 7), 2)) ids.push("visao-de-futuro");
  const [posts] = await database.select({ value: count() }).from(planningPost).where(eq(planningPost.monthId, input.monthId));
  if (posts.value >= 10) ids.push("o-arquiteto");
  if (ids.length === 0) return unlocks;
  for (const userId of members) addUnlocks(unlocks, userId, await grantAchievements(database, userId, ids));
  return unlocks;
}

// Mensagens (dos trabalhos e do chat).

/** Mensagem enviada. `body` já normalizado (como foi gravado). */
export async function onMessageSent(
  database: Database,
  input: {
    kind: MessageKind;
    authorId: string;
    body: string;
    /** Só nos trabalhos: quem foi @mencionado (já filtrado). */
    mentions?: string[];
    attachments: number;
    /** Algum anexo é imagem colada com Ctrl+V. */
    pastedImage?: boolean;
    conversationId?: string;
    at?: Date;
  },
): Promise<UnlockMap> {
  const at = input.at ?? new Date();
  const unlocks: UnlockMap = new Map();
  const { authorId } = input;
  const unlocked = await listUnlockedIds(database, authorId);
  const tokens = splitMessageText(input.body);
  const effect = messageEffectOf(input.body, input.attachments);
  const mentions = (input.mentions ?? []).filter((id) => id !== authorId);

  const metrics: Parameters<typeof reachedGoals>[2] = ["messagesSent"];
  if (tokens.some((token) => token.type === "url")) metrics.push("linkMessages");
  if (input.attachments > 0) metrics.push("attachmentsSent");
  if (effect) metrics.push("commandsUsed");
  const ids = await reachedGoals(database, { userId: authorId, isAdmin: false, now: at, unlocked }, metrics);

  if (tokens.some((token) => token.type === "path")) ids.push("ta-na-rede");
  if (input.kind === "job" && mentions.length > 0) ids.push("ei-voce");
  if (input.pastedImage && input.attachments > 0) ids.push("print-ou-nao-aconteceu");
  if (effect === "matrix") ids.push("que-comando-e-esse");
  if (saoPauloClock(at).hour < 5) ids.push("coruja");
  if (input.kind === "chat" && input.conversationId && !unlocked.has("puxando-assunto")) {
    const [row] = await database
      .select({ value: count() })
      .from(chatMessage)
      .where(eq(chatMessage.conversationId, input.conversationId));
    if (row.value === 1) ids.push("puxando-assunto");
  }
  addUnlocks(unlocks, authorId, await grantAchievements(database, authorId, ids.filter((id) => !unlocked.has(id))));

  for (const userId of new Set(mentions)) {
    const theirs = await listUnlockedIds(database, userId);
    const reached = await reachedGoals(database, { userId, isAdmin: false, now: at, unlocked: theirs }, ["mentionsReceived"]);
    addUnlocks(unlocks, userId, await grantAchievements(database, userId, reached));
  }
  return unlocks;
}

/** Mensagem apagada: só vale quem apagou a própria. */
export async function onMessageDeleted(database: Database, input: { authorId: string | null; actorId: string }) {
  const unlocks: UnlockMap = new Map();
  if (input.authorId !== input.actorId) return unlocks;
  return addUnlocks(unlocks, input.actorId, await grantAchievements(database, input.actorId, ["eu-nao-disse-isso"]));
}

async function messageAuthor(database: Database, kind: MessageKind, messageId: string) {
  const table = kind === "job" ? jobMessage : chatMessage;
  const [row] = await database.select({ authorId: table.authorId }).from(table).where(eq(table.id, messageId));
  return row?.authorId ?? null;
}

/** Reação ligada (desligar não conta). */
export async function onReactionAdded(
  database: Database,
  input: { kind: MessageKind; messageId: string; userId: string; at?: Date },
): Promise<UnlockMap> {
  const at = input.at ?? new Date();
  const unlocks: UnlockMap = new Map();
  const mine = await listUnlockedIds(database, input.userId);
  const used = await reachedGoals(database, { userId: input.userId, isAdmin: false, now: at, unlocked: mine }, ["reactionsUsed"]);
  addUnlocks(unlocks, input.userId, await grantAchievements(database, input.userId, used));

  const authorId = await messageAuthor(database, input.kind, input.messageId);
  if (authorId && authorId !== input.userId) {
    const theirs = await listUnlockedIds(database, authorId);
    const received = await reachedGoals(database, { userId: authorId, isAdmin: false, now: at, unlocked: theirs }, ["reactionsReceived"]);
    addUnlocks(unlocks, authorId, await grantAchievements(database, authorId, received));
  }
  return unlocks;
}

/** Mensagem fixada: quem fixou e, se for de outra pessoa, quem escreveu. */
export async function onMessagePinned(
  database: Database,
  input: { kind: MessageKind; messageId: string; actorId: string },
): Promise<UnlockMap> {
  const unlocks: UnlockMap = new Map();
  addUnlocks(unlocks, input.actorId, await grantAchievements(database, input.actorId, ["importante-ta"]));
  const authorId = await messageAuthor(database, input.kind, input.messageId);
  if (authorId && authorId !== input.actorId) {
    addUnlocks(unlocks, authorId, await grantAchievements(database, authorId, ["pra-ninguem-esquecer"]));
  }
  return unlocks;
}

/** Mensagem guardada nas favoritas (tirar não conta). */
export async function onMessageFavorited(database: Database, input: { userId: string; at?: Date }): Promise<UnlockMap> {
  const unlocked = await listUnlockedIds(database, input.userId);
  const reached = await reachedGoals(
    database,
    { userId: input.userId, isAdmin: false, now: input.at ?? new Date(), unlocked },
    ["favorites"],
  );
  return addUnlocks(new Map(), input.userId, await grantAchievements(database, input.userId, reached));
}

// Sino, perfil e quadros.

/** Marcou notificações como lidas: zerar o sino com 10 ou mais de uma vez é a "Paz Interior". */
export async function onNotificationsRead(database: Database, input: { userId: string; cleared: number }) {
  const unlocks: UnlockMap = new Map();
  if (input.cleared < 10 || (await countUnreadNotifications(database, input.userId)) > 0) return unlocks;
  return addUnlocks(unlocks, input.userId, await grantAchievements(database, input.userId, ["paz-interior"]));
}

export async function onProfileUpdated(database: Database, input: { userId: string; photo?: boolean; birthday?: boolean }) {
  const ids: AchievementId[] = [];
  if (input.photo) ids.push("identidade-confirmada");
  if (input.birthday) ids.push("anota-ai");
  return addUnlocks(new Map(), input.userId, await grantAchievements(database, input.userId, ids));
}

/** Quadro criado (ou que passou a ser de toda a equipe pelas mãos do dono). */
export async function onWhiteboardSaved(
  database: Database,
  input: { userId: string; created: boolean; team: boolean },
) {
  const ids: AchievementId[] = [];
  if (input.created) ids.push("primeiro-rabisco");
  if (input.team) ids.push("mural-da-equipe");
  return addUnlocks(new Map(), input.userId, await grantAchievements(database, input.userId, ids));
}

/** Post-its novos (que ainda não estavam no banco) gravados por essa pessoa. */
export async function onStickiesCreated(
  database: Database,
  input: { userId: string; whiteboardId: string; elementIds: string[]; at?: Date },
): Promise<UnlockMap> {
  const unlocks: UnlockMap = new Map();
  const added = await addRecords(
    database,
    input.elementIds.map((id) => ({ userId: input.userId, kind: "sticky" as const, refId: `${input.whiteboardId}:${id}` })),
  );
  if (added.length === 0) return unlocks;
  const unlocked = await listUnlockedIds(database, input.userId);
  const reached = await reachedGoals(
    database,
    { userId: input.userId, isAdmin: false, now: input.at ?? new Date(), unlocked },
    ["stickies"],
  );
  return addUnlocks(unlocks, input.userId, await grantAchievements(database, input.userId, reached));
}

