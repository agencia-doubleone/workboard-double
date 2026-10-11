import { and, asc, count, desc, eq, isNull, ne, or } from "drizzle-orm";

import type { Database } from "@/db";
import { user, userAchievement } from "@/db/schema";
import {
  achievementOf,
  ACHIEVEMENT_IDS,
  isAchievementId,
  type AchievementId,
  type AchievementMetric,
  type UnlockedAchievement,
} from "@/lib/achievements";
import { goalOf, grantAchievements, loadMetrics } from "./core";

// Leituras da tela de conquistas (/conquistas), do resumo no perfil e dos
// avisos ("Conquista desbloqueada"), e o que o admin concede à mão.

const activeUser = or(isNull(user.banned), ne(user.banned, true));

/** Quem aparece nas abas da tela: a equipe ativa, com quantas conquistas cada um tem. */
export async function listAchievementPeople(database: Database) {
  return database
    .select({ id: user.id, name: user.name, image: user.image, role: user.role, unlocked: count(userAchievement.achievementId) })
    .from(user)
    .leftJoin(userAchievement, eq(userAchievement.userId, user.id))
    .where(activeUser)
    .groupBy(user.id)
    .orderBy(asc(user.name));
}

export type AchievementBoard = Awaited<ReturnType<typeof loadAchievementBoard>>;

/**
 * Tudo da tela para uma pessoa: o que ela desbloqueou, o progresso das metas
 * (as secretas não mostram progresso) e quantas pessoas da equipe têm cada uma.
 */
export async function loadAchievementBoard(
  database: Database,
  input: { userId: string; isAdmin: boolean; now?: Date },
) {
  const now = input.now ?? new Date();
  const metrics = ACHIEVEMENT_IDS.flatMap((id): AchievementMetric[] => {
    const definition = achievementOf(id);
    return definition.goal && !definition.secret ? [definition.goal.metric] : [];
  });
  const [rows, team, values] = await Promise.all([
    database
      .select({
        id: userAchievement.achievementId,
        unlockedAt: userAchievement.unlockedAt,
        grantedByName: userAchievement.grantedByName,
      })
      .from(userAchievement)
      .where(eq(userAchievement.userId, input.userId)),
    database
      .select({ id: userAchievement.achievementId, total: count() })
      .from(userAchievement)
      .innerJoin(user, eq(user.id, userAchievement.userId))
      .where(activeUser)
      .groupBy(userAchievement.achievementId),
    loadMetrics(database, { userId: input.userId, isAdmin: input.isAdmin, now }, metrics),
  ]);

  const unlocked = new Map<AchievementId, { unlockedAt: Date; grantedByName: string | null }>();
  for (const row of rows) {
    if (isAchievementId(row.id)) unlocked.set(row.id, { unlockedAt: row.unlockedAt, grantedByName: row.grantedByName });
  }
  const teamCounts = new Map<AchievementId, number>();
  for (const row of team) if (isAchievementId(row.id)) teamCounts.set(row.id, row.total);

  const progress = new Map<AchievementId, { current: number; goal: number; unit?: string }>();
  for (const id of ACHIEVEMENT_IDS) {
    const goal = goalOf(id, input.isAdmin);
    if (!goal || achievementOf(id).secret) continue;
    progress.set(id, { current: Math.min(values[goal.metric] ?? 0, goal.value), goal: goal.value, unit: goal.unit });
  }
  return { unlocked, teamCounts, progress };
}

/** As últimas desbloqueadas (resumo no perfil). */
export async function listRecentAchievements(database: Database, userId: string, limit: number) {
  const rows = await database
    .select({ id: userAchievement.achievementId, unlockedAt: userAchievement.unlockedAt })
    .from(userAchievement)
    .where(eq(userAchievement.userId, userId))
    .orderBy(desc(userAchievement.unlockedAt));
  const valid = rows.filter((row): row is { id: AchievementId; unlockedAt: Date } => isAchievementId(row.id));
  return { total: valid.length, recent: valid.slice(0, limit) };
}

/**
 * Avisos que a pessoa ainda não viu (desbloqueadas pelo servidor enquanto ela
 * estava em outra tela ou fora). Marca como vistas: com várias abas, só a
 * primeira que pedir mostra.
 */
export async function claimUnseenAchievements(database: Database, userId: string): Promise<UnlockedAchievement[]> {
  const rows = await database
    .update(userAchievement)
    .set({ seenAt: new Date() })
    .where(and(eq(userAchievement.userId, userId), isNull(userAchievement.seenAt)))
    .returning({ id: userAchievement.achievementId, unlockedAt: userAchievement.unlockedAt });
  return rows
    .filter((row): row is { id: AchievementId; unlockedAt: Date } => isAchievementId(row.id))
    .sort((a, b) => a.unlockedAt.getTime() - b.unlockedAt.getTime())
    .map((row) => ({ id: row.id, unlockedAt: row.unlockedAt.toISOString() }));
}

/** Concede uma conquista manual (ex.: Caçador de Bugs). Devolve false se a pessoa já tinha. */
export async function grantManualAchievement(
  database: Database,
  input: { userId: string; achievementId: AchievementId; admin: { id: string; name: string } },
) {
  const added = await grantAchievements(database, input.userId, [input.achievementId], { grantedBy: input.admin });
  return added.length > 0;
}

/** Retira uma conquista manual concedida por engano. */
export async function revokeManualAchievement(database: Database, input: { userId: string; achievementId: AchievementId }) {
  const removed = await database
    .delete(userAchievement)
    .where(and(eq(userAchievement.userId, input.userId), eq(userAchievement.achievementId, input.achievementId)))
    .returning({ id: userAchievement.achievementId });
  return removed.length > 0;
}
