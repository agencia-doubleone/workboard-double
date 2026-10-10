import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { NotificationData, NotificationType } from "@/lib/notifications";
import { user } from "./auth";
import { job } from "./jobs";
import { planning } from "./planning";
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
  ],
);
