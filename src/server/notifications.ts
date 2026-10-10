import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { notification, user } from "@/db/schema";
import type { NotificationData, NotificationType } from "@/lib/notifications";

// Consultas das notificações (sem "server-only": rodam também nos scripts de
// verificação contra PGlite). Quem cria e avisa em tempo real é src/server/notify.ts.

export type NotificationRecord = typeof notification.$inferSelect;

export type NewNotification = {
  userId: string;
  type: Exclude<NotificationType, "job.message">;
  actorId: string | null;
  actorName: string | null;
  jobId: string | null;
  planningId?: string | null;
  whiteboardId?: string | null;
  data: NotificationData;
};

export async function insertNotifications(database: Database, items: NewNotification[]) {
  if (items.length === 0) return [];
  return database.insert(notification).values(items).returning();
}

/**
 * Mensagem num trabalho: soma na notificação de mensagens ainda não lida de cada
 * pessoa (com o autor e o trecho da última) ou cria uma nova.
 */
export async function upsertJobMessageNotifications(
  database: Database,
  input: { userIds: string[]; actorId: string; actorName: string; jobId: string; data: NotificationData },
) {
  if (input.userIds.length === 0) return [];
  const now = new Date();
  return database
    .insert(notification)
    .values(
      input.userIds.map((userId) => ({
        userId,
        type: "job.message" as const,
        actorId: input.actorId,
        actorName: input.actorName,
        jobId: input.jobId,
        data: input.data,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [notification.userId, notification.jobId],
      targetWhere: sql`type = 'job.message' and read_at is null`,
      set: {
        count: sql`${notification.count} + 1`,
        actorId: sql`excluded.actor_id`,
        actorName: sql`excluded.actor_name`,
        data: sql`excluded.data`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();
}

/** As mais recentes primeiro, com a foto de quem fez. `before`: continua de onde a página anterior parou. */
export async function listNotifications(
  database: Database,
  userId: string,
  { limit, before }: { limit: number; before?: Date },
) {
  const rows = await database
    .select({
      id: notification.id,
      type: notification.type,
      actorName: notification.actorName,
      actorImage: user.image,
      jobId: notification.jobId,
      data: notification.data,
      count: notification.count,
      updatedAt: notification.updatedAt,
      readAt: notification.readAt,
    })
    .from(notification)
    .leftJoin(user, eq(user.id, notification.actorId))
    .where(and(eq(notification.userId, userId), before ? lt(notification.updatedAt, before) : undefined))
    .orderBy(desc(notification.updatedAt), desc(notification.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type NotificationItem = Awaited<ReturnType<typeof listNotifications>>["items"][number];

export async function countUnreadNotifications(database: Database, userId: string) {
  const [{ total }] = await database
    .select({ total: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return total;
}

/** Marca como lidas (todas, ou só as dos ids). Devolve quantas mudaram. */
export async function markNotificationsRead(database: Database, userId: string, ids?: string[]) {
  if (ids && ids.length === 0) return 0;
  const rows = await database
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        ids ? inArray(notification.id, ids) : undefined,
      ),
    )
    .returning({ id: notification.id });
  return rows.length;
}

/** Abrir o trabalho dá como vistas todas as notificações dele. Devolve quantas mudaram. */
export async function markJobNotificationsRead(database: Database, userId: string, jobId: string) {
  const rows = await database
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), eq(notification.jobId, jobId), isNull(notification.readAt)))
    .returning({ id: notification.id });
  return rows.length;
}
