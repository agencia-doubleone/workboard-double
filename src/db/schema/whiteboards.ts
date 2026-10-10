import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { StoredElement, WhiteboardAccess } from "@/lib/whiteboards";
import { user } from "./auth";
import { job } from "./jobs";

// Quadros brancos (Excalidraw). Pessoal (só o dono), de pessoas escolhidas ou
// de toda a equipe; pode ser vinculado a um trabalho. O desenho fica em
// `whiteboard_element`, um registro por elemento, para duas pessoas editando
// juntas não sobrescreverem o trabalho uma da outra.

export const whiteboard = pgTable(
  "whiteboard",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    access: text("access").$type<WhiteboardAccess>().notNull().default("private"),
    // Excluir o trabalho não leva o quadro: ele só deixa de estar vinculado.
    jobId: uuid("job_id").references(() => job.id, { onDelete: "set null" }),
    /** Quem criou: gerencia o quadro (nome, acesso, exclusão), além dos admins nos coletivos. */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    /** Miniatura da lista (data URL WebP/PNG), gerada no navegador de quem editou. */
    preview: text("preview"),
    previewUpdatedAt: timestamp("preview_updated_at", { withTimezone: true }),
    /** Última mudança no desenho (a lista ordena por aqui). */
    contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }).defaultNow().notNull(),
    contentUpdatedById: text("content_updated_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("whiteboard_owner_idx").on(table.ownerId),
    index("whiteboard_job_idx").on(table.jobId),
    index("whiteboard_content_updated_at_idx").on(table.contentUpdatedAt.desc()),
  ],
);

/** Pessoas escolhidas (acesso "members"). O dono não precisa estar aqui. */
export const whiteboardMember = pgTable(
  "whiteboard_member",
  {
    whiteboardId: uuid("whiteboard_id")
      .notNull()
      .references(() => whiteboard.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.whiteboardId, table.userId] }), index("whiteboard_member_user_idx").on(table.userId)],
);

/**
 * Um elemento do Excalidraw, como ele veio (`data`). Fica a versão maior: se duas
 * pessoas mexerem no mesmo elemento, vale a última mudança (com o mesmo critério
 * de desempate do Excalidraw). Elementos apagados ficam marcados (`isDeleted`),
 * para quem estava com o quadro aberto também apagar.
 */
export const whiteboardElement = pgTable(
  "whiteboard_element",
  {
    whiteboardId: uuid("whiteboard_id")
      .notNull()
      .references(() => whiteboard.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    versionNonce: integer("version_nonce").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    data: jsonb("data").$type<StoredElement>().notNull(),
    /** Hora do servidor: quem está sem tempo real busca o que mudou desde a última vez. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.whiteboardId, table.id] }),
    index("whiteboard_element_updated_at_idx").on(table.whiteboardId, table.updatedAt),
  ],
);
