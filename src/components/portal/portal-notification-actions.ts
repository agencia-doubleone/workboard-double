"use server";

import { z } from "zod";

import { db } from "@/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  PORTAL_NOTIFICATIONS_PAGE_SIZE,
  portalNotificationHref,
  portalNotificationText,
} from "@/lib/portal-notifications";
import { getPortalSession } from "@/lib/portal-session";
import { resolveMediaUrl } from "@/server/media";
import {
  countUnreadPortalNotifications,
  listPortalNotifications,
  markPortalNotificationsRead,
  type PortalNotificationItem,
} from "@/server/portal-notifications";

// O sino do portal do cliente. Sempre as notificações do contato da sessão:
// ninguém lê nem marca as de outro.

export type PortalNotificationView = {
  id: string;
  title: string;
  body: string;
  /** Quem da Double One fez. */
  actorName: string | null;
  actorImageUrl: string | null;
  href: string;
  unread: boolean;
  /** ISO: cursor para "Carregar mais". */
  updatedAt: string;
  time: { label: string; absolute: string };
};

function toView(item: PortalNotificationItem, now: Date): PortalNotificationView {
  return {
    id: item.id,
    ...portalNotificationText(item),
    actorName: item.actorName,
    actorImageUrl: resolveMediaUrl(item.actorImage),
    href: portalNotificationHref(item),
    unread: item.readAt === null,
    updatedAt: item.updatedAt.toISOString(),
    time: { label: formatRelative(item.updatedAt, now), absolute: formatDateTime(item.updatedAt) },
  };
}

/** Não lidas (o número do sino). null sem sessão. */
export async function getPortalUnreadCount() {
  const session = await getPortalSession();
  if (!session) return null;
  return countUnreadPortalNotifications(db, session.contact.id);
}

const listSchema = z.object({ before: z.iso.datetime().optional() });

/** Uma página do sino; `before` continua de onde a anterior parou. */
export async function getPortalNotifications(input: { before?: string } = {}) {
  const session = await getPortalSession();
  if (!session) return null;
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return null;
  const { items, hasMore } = await listPortalNotifications(db, session.contact.id, {
    limit: PORTAL_NOTIFICATIONS_PAGE_SIZE,
    before: parsed.data.before ? new Date(parsed.data.before) : undefined,
  });
  const now = new Date();
  return { items: items.map((item) => toView(item, now)), hasMore };
}

const readSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

/** Marca como lidas: as dos ids, ou todas. */
export async function readPortalNotifications(input: { ids?: string[] } = {}) {
  const session = await getPortalSession();
  if (!session) return { ok: false as const };
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  await markPortalNotificationsRead(db, session.contact.id, parsed.data.ids);
  return { ok: true as const };
}
