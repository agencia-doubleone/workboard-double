import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Trilha de auditoria genérica: quem (ator) fez o quê (ação) em qual
// registro (entidade). Nome/e-mail do ator e o rótulo da entidade são
// copiados no momento do evento, para o histórico continuar legível mesmo
// que o registro mude depois.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt.desc()),
    index("audit_log_action_idx").on(table.action, table.createdAt.desc()),
    index("audit_log_actor_idx").on(table.actorId, table.createdAt.desc()),
    index("audit_log_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt.desc(),
    ),
  ],
);
