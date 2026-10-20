import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { portalNotification, user } from "@/db/schema";
import type { PortalNotificationData, PortalNotificationType } from "@/lib/portal-notifications";

// O sino do portal do cliente (sem "server-only": testável com PGlite). Sempre
// das notificações do próprio contato: quem chama passa o id da sessão.

export type NewPortalNotification = {
  portalUserId: string;
  type: Exclude<PortalNotificationType, "request.message">;
  clientRequestId: string;
  actorId: string | null;
  actorName: string;
  data: PortalNotificationData;
};

export async function insertPortalNotifications(database: Database, items: NewPortalNotification[]) {
  if (items.length === 0) return [];
  return database.insert(portalNotification).values(items).returning();
}

/**
 * Mensagem da equipe numa solicitação: soma na notificação ainda não lida de
 * cada contato (índice único parcial portal_notification_open_message_idx).
 */
export async function upsertPortalMessageNotifications(
  database: Database,
  input: { portalUserIds: string[]; actorId: string | null; actorName: string; clientRequestId: string; data: PortalNotificationData },
) {
  if (input.portalUserIds.length === 0) return [];
  const now = new Date();
  return database
    .insert(portalNotification)
    .values(
      input.portalUserIds.map((portalUserId) => ({
        portalUserId,
        type: "request.message" as const,
        clientRequestId: input.clientRequestId,
        actorId: input.actorId,
        actorName: input.actorName,
        data: input.data,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [portalNotification.portalUserId, portalNotification.clientRequestId],
      targetWhere: sql`type = 'request.message' and read_at is null`,
      set: {
        count: sql`${portalNotification.count} + 1`,
        actorId: sql`excluded.actor_id`,
        actorName: sql`excluded.actor_name`,
        data: sql`excluded.data`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();
}

/** As mais recentes primeiro, com a foto de quem da Double One fez. */
export async function listPortalNotifications(
  database: Database,
  portalUserId: string,
  { limit, before }: { limit: number; before?: Date },
) {
  const rows = await database
    .select({
      id: portalNotification.id,
      type: portalNotification.type,
      actorName: portalNotification.actorName,
      actorImage: user.image,
      data: portalNotification.data,
      count: portalNotification.count,
      updatedAt: portalNotification.updatedAt,
      readAt: portalNotification.readAt,
    })
    .from(portalNotification)
    .leftJoin(user, eq(user.id, portalNotification.actorId))
    .where(and(eq(portalNotification.portalUserId, portalUserId), before ? lt(portalNotification.updatedAt, before) : undefined))
    .orderBy(desc(portalNotification.updatedAt), desc(portalNotification.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type PortalNotificationItem = Awaited<ReturnType<typeof listPortalNotifications>>["items"][number];

export async function countUnreadPortalNotifications(database: Database, portalUserId: string) {
  const [{ total }] = await database
    .select({ total: count() })
    .from(portalNotification)
    .where(and(eq(portalNotification.portalUserId, portalUserId), isNull(portalNotification.readAt)));
  return total;
}

/** Marca como lidas (todas, ou só as dos ids) do próprio contato. Devolve quantas mudaram. */
export async function markPortalNotificationsRead(database: Database, portalUserId: string, ids?: string[]) {
  if (ids && ids.length === 0) return 0;
  const rows = await database
    .update(portalNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(portalNotification.portalUserId, portalUserId),
        isNull(portalNotification.readAt),
        ids ? inArray(portalNotification.id, ids) : undefined,
      ),
    )
    .returning({ id: portalNotification.id });
  return rows.length;
}

/** Abrir a solicitação no portal dá como vistas as notificações dela. */
export async function markPortalRequestNotificationsRead(database: Database, portalUserId: string, clientRequestId: string) {
  const rows = await database
    .update(portalNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(portalNotification.portalUserId, portalUserId),
        eq(portalNotification.clientRequestId, clientRequestId),
        isNull(portalNotification.readAt),
      ),
    )
    .returning({ id: portalNotification.id });
  return rows.length;
}
