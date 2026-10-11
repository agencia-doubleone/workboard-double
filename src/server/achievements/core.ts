import { and, count, countDistinct, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { NAV_SECTIONS } from "@/components/shell/nav-config";
import type { Database } from "@/db";
import {
  achievementCounter,
  achievementLaunch,
  achievementRecord,
  chatMessage,
  chatMessageAttachment,
  chatMessageFavorite,
  chatMessageReaction,
  job,
  jobAssignee,
  jobMessage,
  jobMessageAttachment,
  jobMessageFavorite,
  jobMessageReaction,
  jobStatus,
  planningMember,
  user,
  userAchievement,
} from "@/db/schema";
import {
  ACHIEVEMENTS,
  achievementOf,
  daysBetween,
  EASTER_EGG_ID,
  isAchievementId,
  saoPauloClock,
  type AchievementCounterKey,
  type AchievementId,
  type AchievementMetric,
  type AchievementRecordKind,
} from "@/lib/achievements";
import { MESSAGE_REACTIONS, VISIBLE_MESSAGE_EFFECTS } from "@/lib/messages";
import { ACCENTS } from "@/lib/preferences";

// O que todas as regras usam: desbloquear, os registros "uma vez cada", os
// contadores e os números das metas. Tudo recebe o Database (testável com PGlite).

/** Quem desbloqueou o quê numa rodada (para avisar em tempo real). */
export type UnlockMap = Map<string, AchievementId[]>;

/** Momento do lançamento (subconsulta): sem a linha, nada do que já estava no banco conta. */
const sinceLaunch = sql`(select ${achievementLaunch.launchedAt} from ${achievementLaunch} limit 1)`;

export async function listUnlockedIds(database: Database, userId: string) {
  const rows = await database
    .select({ id: userAchievement.achievementId })
    .from(userAchievement)
    .where(eq(userAchievement.userId, userId));
  return new Set(rows.map((row) => row.id).filter(isAchievementId));
}

/**
 * Desbloqueia o que a pessoa ainda não tem e devolve só as novas. Uma secreta
 * nova traz junto a "Isso É um Easter Egg?". `seen`: o aviso já vai aparecer na
 * tela de quem pediu (eventos do navegador).
 */
export async function grantAchievements(
  database: Database,
  userId: string,
  ids: AchievementId[],
  options: { seen?: boolean; grantedBy?: { id: string; name: string } } = {},
): Promise<AchievementId[]> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  if ([...wanted].some((id) => id !== EASTER_EGG_ID && achievementOf(id).secret)) wanted.add(EASTER_EGG_ID);
  const now = new Date();
  const rows = await database
    .insert(userAchievement)
    .values(
      [...wanted].map((achievementId) => ({
        userId,
        achievementId,
        unlockedAt: now,
        seenAt: options.seen ? now : null,
        grantedById: options.grantedBy?.id ?? null,
        grantedByName: options.grantedBy?.name ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: userAchievement.achievementId });
  return rows.map((row) => row.id).filter(isAchievementId);
}

/** Junta as conquistas novas de uma pessoa no mapa da rodada. */
export function addUnlocks(map: UnlockMap, userId: string, ids: AchievementId[]) {
  if (ids.length === 0) return map;
  map.set(userId, [...(map.get(userId) ?? []), ...ids]);
  return map;
}

/** Grava o que conta uma vez cada; devolve só as linhas novas (as repetidas não contam de novo). */
export async function addRecords(
  database: Database,
  rows: { userId: string; kind: AchievementRecordKind; refId: string; occurredAt?: Date; onTime?: boolean | null }[],
) {
  if (rows.length === 0) return [];
  return database
    .insert(achievementRecord)
    .values(rows)
    .onConflictDoNothing()
    .returning({ userId: achievementRecord.userId, refId: achievementRecord.refId });
}

export async function listRecordRefs(database: Database, userId: string, kind: AchievementRecordKind) {
  const rows = await database
    .select({ refId: achievementRecord.refId })
    .from(achievementRecord)
    .where(and(eq(achievementRecord.userId, userId), eq(achievementRecord.kind, kind)));
  return rows.map((row) => row.refId);
}

/** Trabalhos que a pessoa concluiu (a partir do lançamento), do mais recente para trás. */
export function listCompletions(database: Database, userId: string) {
  return database
    .select({ refId: achievementRecord.refId, occurredAt: achievementRecord.occurredAt, onTime: achievementRecord.onTime })
    .from(achievementRecord)
    .where(and(eq(achievementRecord.userId, userId), eq(achievementRecord.kind, "job.completed")))
    .orderBy(desc(achievementRecord.occurredAt));
}

/** Soma 1 no contador e devolve o valor novo. */
export async function incrementCounter(database: Database, userId: string, key: AchievementCounterKey) {
  const [row] = await database
    .insert(achievementCounter)
    .values({ userId, key, value: 1 })
    .onConflictDoUpdate({
      target: [achievementCounter.userId, achievementCounter.key],
      set: { value: sql`${achievementCounter.value} + 1`, updatedAt: sql`now()` },
    })
    .returning({ value: achievementCounter.value });
  return row.value;
}

async function counterValue(database: Database, userId: string, key: AchievementCounterKey) {
  const [row] = await database
    .select({ value: achievementCounter.value })
    .from(achievementCounter)
    .where(and(eq(achievementCounter.userId, userId), eq(achievementCounter.key, key)));
  return row?.value ?? 0;
}

/** Trabalhos "em aberto" da pessoa (ativos e num status que não encerra). */
export async function countOpenJobs(database: Database, userId: string) {
  const [row] = await database
    .select({ value: count() })
    .from(jobAssignee)
    .innerJoin(job, eq(job.id, jobAssignee.jobId))
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(and(eq(jobAssignee.userId, userId), eq(job.active, true), eq(jobStatus.isFinal, false)));
  return row.value;
}

/** As seções do menu que a pessoa vê (o "Explorador"). */
export function visibleSections(isAdmin: boolean) {
  return [...NAV_SECTIONS.main.items, ...(isAdmin ? NAV_SECTIONS.admin.items : [])].map((item) => item.href);
}

// Números das metas.

type MetricContext = { userId: string; isAdmin: boolean; now: Date };

async function sumCounts(queries: Promise<{ value: number }[]>[]) {
  const results = await Promise.all(queries);
  return results.reduce((total, [row]) => total + (row?.value ?? 0), 0);
}

async function distinctValues(queries: Promise<{ value: string }[]>[]) {
  const results = await Promise.all(queries);
  return new Set(results.flat().map((row) => row.value));
}

const hasLink = (column: typeof jobMessage.body | typeof chatMessage.body) => sql`${column} ~* 'https?://'`;

const METRICS: Record<AchievementMetric, (database: Database, context: MetricContext) => Promise<number>> = {
  jobsCompleted: (database, { userId }) => countRecords(database, userId, "job.completed"),
  monthsFinalized: (database, { userId }) => countRecords(database, userId, "planning.finalized"),
  stickies: (database, { userId }) => countRecords(database, userId, "sticky"),
  searchResultsOpened: (database, { userId }) => countRecords(database, userId, "search.result"),
  accentsTried: async (database, { userId }) => {
    const tried = new Set(await listRecordRefs(database, userId, "accent"));
    return ACCENTS.filter((accent) => tried.has(accent.id)).length;
  },
  sectionsVisited: async (database, { userId, isAdmin }) => {
    const visited = new Set(await listRecordRefs(database, userId, "nav"));
    return visibleSections(isAdmin).filter((href) => visited.has(href)).length;
  },
  searchShortcut: (database, { userId }) => counterValue(database, userId, "search.shortcut"),
  profileVisits: (database, { userId }) => counterValue(database, userId, "profile.visit"),
  planningsResponsible: async (database, { userId }) => {
    const [row] = await database.select({ value: count() }).from(planningMember).where(eq(planningMember.userId, userId));
    return row.value;
  },
  daysRegistered: async (database, { userId, now }) => {
    const [row] = await database.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, userId));
    return row ? Math.max(0, daysBetween(saoPauloClock(row.createdAt).day, saoPauloClock(now).day)) : 0;
  },
  messagesSent: (database, { userId }) =>
    sumCounts([
      database
        .select({ value: count() })
        .from(jobMessage)
        .where(and(eq(jobMessage.authorId, userId), gte(jobMessage.createdAt, sinceLaunch))),
      database
        .select({ value: count() })
        .from(chatMessage)
        .where(and(eq(chatMessage.authorId, userId), gte(chatMessage.createdAt, sinceLaunch))),
    ]),
  linkMessages: (database, { userId }) =>
    sumCounts([
      database
        .select({ value: count() })
        .from(jobMessage)
        .where(and(eq(jobMessage.authorId, userId), gte(jobMessage.createdAt, sinceLaunch), hasLink(jobMessage.body))),
      database
        .select({ value: count() })
        .from(chatMessage)
        .where(and(eq(chatMessage.authorId, userId), gte(chatMessage.createdAt, sinceLaunch), hasLink(chatMessage.body))),
    ]),
  attachmentsSent: (database, { userId }) =>
    sumCounts([
      database
        .select({ value: count() })
        .from(jobMessageAttachment)
        .innerJoin(jobMessage, eq(jobMessage.id, jobMessageAttachment.messageId))
        .where(and(eq(jobMessage.authorId, userId), gte(jobMessage.createdAt, sinceLaunch))),
      database
        .select({ value: count() })
        .from(chatMessageAttachment)
        .innerJoin(chatMessage, eq(chatMessage.id, chatMessageAttachment.messageId))
        .where(and(eq(chatMessage.authorId, userId), gte(chatMessage.createdAt, sinceLaunch))),
    ]),
  commandsUsed: async (database, { userId }) => {
    const commands = VISIBLE_MESSAGE_EFFECTS.map((effect) => `/${effect}`);
    const used = await distinctValues([
      database
        .selectDistinct({ value: jobMessage.body })
        .from(jobMessage)
        .where(and(eq(jobMessage.authorId, userId), gte(jobMessage.createdAt, sinceLaunch), inArray(jobMessage.body, commands))),
      database
        .selectDistinct({ value: chatMessage.body })
        .from(chatMessage)
        .where(and(eq(chatMessage.authorId, userId), gte(chatMessage.createdAt, sinceLaunch), inArray(chatMessage.body, commands))),
    ]);
    return used.size;
  },
  reactionsUsed: async (database, { userId }) => {
    const used = await distinctValues([
      database
        .selectDistinct({ value: jobMessageReaction.emoji })
        .from(jobMessageReaction)
        .where(and(eq(jobMessageReaction.userId, userId), gte(jobMessageReaction.createdAt, sinceLaunch))),
      database
        .selectDistinct({ value: chatMessageReaction.emoji })
        .from(chatMessageReaction)
        .where(and(eq(chatMessageReaction.userId, userId), gte(chatMessageReaction.createdAt, sinceLaunch))),
    ]);
    return MESSAGE_REACTIONS.filter((emoji) => used.has(emoji)).length;
  },
  // Reações dos outros (a própria não conta).
  reactionsReceived: (database, { userId }) =>
    sumCounts([
      database
        .select({ value: count() })
        .from(jobMessageReaction)
        .innerJoin(jobMessage, eq(jobMessage.id, jobMessageReaction.messageId))
        .where(
          and(
            eq(jobMessage.authorId, userId),
            ne(jobMessageReaction.userId, userId),
            gte(jobMessageReaction.createdAt, sinceLaunch),
          ),
        ),
      database
        .select({ value: count() })
        .from(chatMessageReaction)
        .innerJoin(chatMessage, eq(chatMessage.id, chatMessageReaction.messageId))
        .where(
          and(
            eq(chatMessage.authorId, userId),
            ne(chatMessageReaction.userId, userId),
            gte(chatMessageReaction.createdAt, sinceLaunch),
          ),
        ),
    ]),
  mentionsReceived: (database, { userId }) =>
    sumCounts([
      database
        .select({ value: count() })
        .from(jobMessage)
        .where(
          and(
            sql`${userId} = any(${jobMessage.mentions})`,
            or(isNull(jobMessage.authorId), ne(jobMessage.authorId, userId)),
            gte(jobMessage.createdAt, sinceLaunch),
          ),
        ),
    ]),
  favorites: (database, { userId }) =>
    sumCounts([
      database
        .select({ value: count() })
        .from(jobMessageFavorite)
        .where(and(eq(jobMessageFavorite.userId, userId), gte(jobMessageFavorite.createdAt, sinceLaunch))),
      database
        .select({ value: count() })
        .from(chatMessageFavorite)
        .where(and(eq(chatMessageFavorite.userId, userId), gte(chatMessageFavorite.createdAt, sinceLaunch))),
    ]),
};

async function countRecords(database: Database, userId: string, kind: AchievementRecordKind) {
  const [row] = await database
    .select({ value: count() })
    .from(achievementRecord)
    .where(and(eq(achievementRecord.userId, userId), eq(achievementRecord.kind, kind)));
  return row.value;
}

export type MetricValues = Partial<Record<AchievementMetric, number>>;

/** Os números pedidos de uma pessoa. */
export async function loadMetrics(
  database: Database,
  context: MetricContext,
  metrics: AchievementMetric[],
): Promise<MetricValues> {
  const unique = [...new Set(metrics)];
  const values = await Promise.all(unique.map((metric) => METRICS[metric](database, context)));
  return Object.fromEntries(unique.map((metric, index) => [metric, values[index]]));
}

/** Quanto falta para a meta: o valor e o alvo (o "Explorador" depende das seções que a pessoa vê). */
export function goalOf(id: AchievementId, isAdmin: boolean) {
  const goal = achievementOf(id).goal;
  if (!goal) return null;
  return { metric: goal.metric, value: goal.value ?? visibleSections(isAdmin).length, unit: goal.unit };
}

/** As conquistas com meta que olham para estes números. */
export function achievementsWithMetrics(metrics: AchievementMetric[]) {
  const wanted = new Set(metrics);
  return (Object.keys(ACHIEVEMENTS) as AchievementId[]).filter((id) => {
    const goal = achievementOf(id).goal;
    return goal && wanted.has(goal.metric);
  });
}

/**
 * Confere as metas das conquistas que a pessoa ainda não tem e que dependem
 * destes números; só carrega o que falta. Devolve as metas atingidas.
 */
export async function reachedGoals(
  database: Database,
  context: MetricContext & { unlocked: Set<AchievementId> },
  metrics: AchievementMetric[],
) {
  const pending = achievementsWithMetrics(metrics).filter((id) => !context.unlocked.has(id));
  if (pending.length === 0) return [];
  const values = await loadMetrics(
    database,
    context,
    pending.map((id) => achievementOf(id).goal!.metric),
  );
  return pending.filter((id) => {
    const goal = goalOf(id, context.isAdmin)!;
    return (values[goal.metric] ?? 0) >= goal.value;
  });
}

/** Quantos trabalhos diferentes a agência concluiu desde o lançamento (o "Grand Finale"). */
export async function countAgencyCompletions(database: Database) {
  const [row] = await database
    .select({ value: countDistinct(achievementRecord.refId) })
    .from(achievementRecord)
    .where(eq(achievementRecord.kind, "job.completed"));
  return row.value;
}

/** A pessoa existe e está ativa? (desativados não ganham nada). */
export async function isActiveUser(database: Database, userId: string) {
  const [row] = await database
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), or(isNull(user.banned), eq(user.banned, false))));
  return Boolean(row);
}
