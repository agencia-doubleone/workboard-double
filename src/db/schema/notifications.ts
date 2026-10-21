import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { NotificationData, NotificationType } from "@/lib/notifications";
import type { PortalNotificationData, PortalNotificationType } from "@/lib/portal-notifications";
import { user } from "./auth";
import { clientRequest } from "./client-requests";
import { job } from "./jobs";
import { planning, planningMonth } from "./planning";
import { portalUser } from "./portal";
import { whiteboard } from "./whiteboards";

// Notificações do sino (header). Quem fez a ação nunca é notificado dela. O texto
// é montado na leitura a partir de `type` + `data` (src/lib/notifications.ts), com
// nome do trabalho, status e trecho da mensagem copiados no momento do evento.
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quem recebe. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** Nome copiado: quem fez pode ser excluído depois. */
    actorName: text("actor_name"),
    // Excluir o trabalho leva as notificações dele.
    jobId: uuid("job_id").references(() => job.id, { onDelete: "cascade" }),
    // Excluir o planejamento leva as notificações dele.
    planningId: uuid("planning_id").references(() => planning.id, { onDelete: "cascade" }),
    // Excluir o quadro leva as notificações dele.
    whiteboardId: uuid("whiteboard_id").references(() => whiteboard.id, { onDelete: "cascade" }),
    // Solicitação do portal do cliente (request.*).
    clientRequestId: uuid("client_request_id").references(() => clientRequest.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<NotificationData>().notNull(),
    /** Mensagens do mesmo trabalho somam numa notificação só, enquanto ela não é lida. */
    count: integer("count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** Último evento (mensagens somadas atualizam): a lista ordena por aqui. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("notification_user_updated_at_idx").on(table.userId, table.updatedAt.desc()),
    // Uma notificação de mensagens aberta por pessoa e trabalho (as novas somam nela).
    uniqueIndex("notification_open_job_message_idx")
      .on(table.userId, table.jobId)
      .where(sql`${table.type} = 'job.message' and ${table.readAt} is null`),
    // O mesmo para as mensagens de cada solicitação.
    uniqueIndex("notification_open_request_message_idx")
      .on(table.userId, table.clientRequestId)
      .where(sql`${table.type} = 'request.message' and ${table.readAt} is null`),
  ],
);

/**
 * O sino do portal do cliente: um registro por contato. Quem faz é sempre
 * alguém da Double One (o nome fica copiado); o texto sai de `type` + `data`
 * (src/lib/portal-notifications.ts). Excluir a solicitação ou o contato leva junto.
 */
export const portalNotification = pgTable(
  "portal_notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalUserId: text("portal_user_id")
      .notNull()
      .references(() => portalUser.id, { onDelete: "cascade" }),
    type: text("type").$type<PortalNotificationType>().notNull(),
    /** Do que é a notificação: uma solicitação ou um mês do planejamento (um dos dois, conferido no banco). */
    clientRequestId: uuid("client_request_id").references(() => clientRequest.id, { onDelete: "cascade" }),
    planningMonthId: uuid("planning_month_id").references(() => planningMonth.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    data: jsonb("data").$type<PortalNotificationData>().notNull(),
    /** Mensagens da mesma solicitação somam numa notificação só, enquanto ela não é lida. */
    count: integer("count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("portal_notification_user_updated_at_idx").on(table.portalUserId, table.updatedAt.desc()),
    uniqueIndex("portal_notification_open_message_idx")
      .on(table.portalUserId, table.clientRequestId)
      .where(sql`${table.type} = 'request.message' and ${table.readAt} is null`),
    check("portal_notification_target_check", sql`num_nonnulls(${table.clientRequestId}, ${table.planningMonthId}) = 1`),
  ],
);
