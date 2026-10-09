import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { client } from "./clients";
import { media } from "./media";

// Status de trabalho, cadastrados pelos admins (Administração › Status).
// Um é o padrão de todo trabalho novo; os "finais" encerram o trabalho (ele sai
// da lista do dia a dia). Status em uso não podem ser apagados.
export const jobStatus = pgTable("job_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  /** Cores do selo, em hex (#rrggbb). */
  textColor: text("text_color").notNull(),
  backgroundColor: text("background_color").notNull(),
  position: integer("position").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isFinal: boolean("is_final").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Trabalhos. O PIT é o número sequencial que a agência usa no dia a dia
// (/trabalhos/{pit}); começa em 1 e nunca é reaproveitado.
export const job = pgTable(
  "job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pit: integer("pit").generatedAlwaysAsIdentity().notNull().unique(),
    name: text("name").notNull(),
    // Cliente nunca é excluído (só arquivado); restrict protege o histórico.
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => jobStatus.id, { onDelete: "restrict" }),
    /** Data de entrega: data pura "AAAA-MM-DD", sem fuso. */
    dueDate: date("due_date", { mode: "string" }),
    /** Inativo some das listas do dia a dia, sem apagar. */
    active: boolean("active").notNull().default(true),
    /** HTML do editor, já limpo no servidor (sanitizeRichText). */
    briefing: text("briefing"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    /** "Lançamento". */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("job_status_idx").on(table.statusId),
    index("job_client_idx").on(table.clientId),
    index("job_created_at_idx").on(table.createdAt.desc()),
  ],
);

/** Funcionários do trabalho. */
export const jobAssignee = pgTable(
  "job_assignee",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.userId] }), index("job_assignee_user_idx").on(table.userId)],
);

/** Cada troca de status (inclusive a inicial), para o histórico e relatórios. */
export const jobStatusHistory = pgTable(
  "job_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    statusId: uuid("status_id").references(() => jobStatus.id, { onDelete: "set null" }),
    /** Nome e cores copiados: o status pode ser renomeado ou apagado depois. */
    statusName: text("status_name").notNull(),
    textColor: text("text_color").notNull(),
    backgroundColor: text("background_color").notNull(),
    changedById: text("changed_by_id").references(() => user.id, { onDelete: "set null" }),
    changedByName: text("changed_by_name"),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("job_status_history_job_idx").on(table.jobId, table.changedAt.desc())],
);

/**
 * Mensagens de um trabalho. Menções ficam no texto como <@userId> e também em
 * `mentions` (para achar "me mencionaram" sem ler o texto).
 */
export const jobMessage = pgTable(
  "job_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    mentions: text("mentions").array().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("job_message_job_idx").on(table.jobId, table.createdAt)],
);

/** Anexos de uma mensagem (arquivos no CDN, pasta "trabalhos"). */
export const jobMessageAttachment = pgTable(
  "job_message_attachment",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => jobMessage.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.mediaId] })],
);

/** Até quando cada pessoa já leu as mensagens de um trabalho (o contador de não lidas). */
export const jobRead = pgTable(
  "job_read",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.userId] })],
);
