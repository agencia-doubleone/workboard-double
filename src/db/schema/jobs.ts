import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { clientRequest } from "./client-requests";
import { client } from "./clients";
import { media } from "./media";

// Status de trabalho, cadastrados pelos admins (Administração › Status).
// Um é o padrão de todo trabalho novo; os "finais" encerram o trabalho (ele sai
// da lista do dia a dia). Os de cancelamento também encerram, mas o trabalho
// cancelado não conta como concluído: sai da planilha, dos relatórios, do
// calendário e do Início, e só aparece no recorte "Cancelados". Status em uso
// não podem ser apagados.
export const jobStatus = pgTable(
  "job_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    /** Cores do selo, em hex (#rrggbb). */
    textColor: text("text_color").notNull(),
    backgroundColor: text("background_color").notNull(),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isFinal: boolean("is_final").notNull().default(false),
    /** Cancela o trabalho (sempre com isFinal). Só admins põem ou tiram um trabalho daqui. */
    isCanceled: boolean("is_canceled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check("job_status_canceled_is_final", sql`not ${table.isCanceled} or ${table.isFinal}`)],
);

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
    /**
     * A solicitação do cliente de onde o trabalho saiu ("Criar trabalho" na página
     * dela). O trabalho continua interno: o cliente não o vê. Excluir a
     * solicitação só desfaz o vínculo.
     */
    clientRequestId: uuid("client_request_id").references(() => clientRequest.id, { onDelete: "set null" }),
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
    index("job_client_request_idx").on(table.clientRequestId),
  ],
);

/** Funcionários do trabalho. Cada vínculo também guarda a ordem na planilha da pessoa. */
export const jobAssignee = pgTable(
  "job_assignee",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Ordem na Minha planilha dessa pessoa (menor = mais acima). Quem entra num
     * trabalho recebe -(segundos desde 1970): o mais novo fica no topo. Arrastar
     * põe o trabalho entre os vizinhos (positionBetween em src/lib/jobs.ts).
     */
    position: doublePrecision("position")
      .notNull()
      .default(sql`(-extract(epoch from now()))`),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.userId] }),
    index("job_assignee_user_position_idx").on(table.userId, table.position),
  ],
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
    /** Fixada no topo da conversa (null = não). Quem fixou pode ser excluído: o nome fica copiado. */
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinnedById: text("pinned_by_id").references(() => user.id, { onDelete: "set null" }),
    pinnedByName: text("pinned_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("job_message_job_idx").on(table.jobId, table.createdAt),
    index("job_message_pinned_idx").on(table.jobId).where(sql`${table.pinnedAt} is not null`),
  ],
);

/** Reações às mensagens de um trabalho: cada pessoa conta uma vez por emoji. */
export const jobMessageReaction = pgTable(
  "job_message_reaction",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => jobMessage.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.emoji] })],
);

/** Mensagens de trabalhos que cada pessoa guardou nas favoritas (só ela vê). */
export const jobMessageFavorite = pgTable(
  "job_message_favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => jobMessage.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.messageId] }),
    index("job_message_favorite_message_idx").on(table.messageId),
  ],
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
