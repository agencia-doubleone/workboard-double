"use server";

import { z } from "zod";

import { db } from "@/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import { NOTIFICATIONS_PAGE_SIZE, notificationHref } from "@/lib/notifications";
import { getSession } from "@/lib/session";
import { achievementsAfter, onNotificationsRead } from "@/server/achievements";
import { countUnreadConversations } from "@/server/chat";
import { resolveMediaUrl } from "@/server/media";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/server/notifications";
import { publishRealtimeAfter } from "@/server/realtime";
import type { NotificationView } from "./types";

// Leituras e marcações do sino e dos contadores do shell. Sempre da própria
// pessoa (a sessão diz quem): ninguém lê nem marca as notificações de outra.

function toNotificationView(item: NotificationItem, now: Date): NotificationView {
  return {
    id: item.id,
    type: item.type,
    actorName: item.actorName,
    actorImageUrl: resolveMediaUrl(item.actorImage),
    data: item.data,
    count: item.count,
    href: notificationHref(item),
    unread: item.readAt === null,
    updatedAt: item.updatedAt.toISOString(),
    time: { label: formatRelative(item.updatedAt, now), absolute: formatDateTime(item.updatedAt) },
  };
}

/** Não lidas do sino e conversas com mensagem nova (os números do header e da sidebar). */
export async function getInboxCounts() {
  const session = await getSession();
  if (!session) return null;
  const [notifications, chats] = await Promise.all([
    countUnreadNotifications(db, session.user.id),
    countUnreadConversations(db, session.user.id),
  ]);
  return { notifications, chats };
}

const listSchema = z.object({ before: z.iso.datetime().optional() });

/** Uma página do sino; `before` continua de onde a anterior parou. */
export async function getNotifications(input: { before?: string } = {}) {
  const session = await getSession();
  if (!session) return null;
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return null;
  const { items, hasMore } = await listNotifications(db, session.user.id, {
    limit: NOTIFICATIONS_PAGE_SIZE,
    before: parsed.data.before ? new Date(parsed.data.before) : undefined,
  });
  const now = new Date();
  return { items: items.map((item) => toNotificationView(item, now)), hasMore };
}

const readSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

/** Marca como lidas: as dos ids, ou todas. As outras abas recontam. */
export async function readNotifications(input: { ids?: string[] } = {}) {
  const session = await getSession();
  if (!session) return { ok: false as const };
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const changed = await markNotificationsRead(db, session.user.id, parsed.data.ids);
  if (changed > 0) publishRealtimeAfter([session.user.id], { type: "notifications.read" });
  // Zerar o sino com 10 ou mais de uma vez: "Paz Interior".
  if (changed >= 10) {
    achievementsAfter("sino zerado", (database) => onNotificationsRead(database, { userId: session.user.id, cleared: changed }));
  }
  return { ok: true as const, changed };
}
