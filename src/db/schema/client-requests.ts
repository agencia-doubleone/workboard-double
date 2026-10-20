import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type {
  DeliveryDecision,
  DeliveryStatus,
  RequestEventData,
  RequestEventType,
  RequestSide,
  RequestStatus,
} from "@/lib/client-requests";
import { user } from "./auth";
import { client } from "./clients";
import { media } from "./media";
import { portalUser } from "./portal";

// Solicitações: pedidos que o cliente faz pelo portal (ou a equipe cadastra por
// ele) e a equipe acompanha em /solicitacoes (só admins). Tudo aqui o cliente vê: assunto, briefing, status,
// previsão de entrega e a conversa. O que é interno da agência fica nos trabalhos.
// O clientId do portal sai sempre da sessão do contato (src/lib/portal-session.ts).

/** Os status de REQUEST_STATUSES (src/lib/client-requests.ts): mudou lá, mude aqui (e gere a migration). */
const STATUS_VALUES = sql.raw(
  "'aguardando_analise', 'em_analise', 'aguardando_orcamento', 'aguardando_aprovacao', 'em_execucao', 'finalizada', 'negada', 'cancelada'",
);

export const clientRequest = pgTable(
  "client_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "S-12" e o endereço (/solicitacoes/12). Começa em 1 e nunca é reaproveitado. */
    number: integer("number").generatedAlwaysAsIdentity().notNull().unique(),
    // Cliente nunca é excluído (só arquivado); restrict protege as solicitações.
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    /** O "assunto" que o cliente escreveu. */
    title: text("title").notNull(),
    /** HTML do editor, já limpo no servidor (sanitizeRichText). */
    briefing: text("briefing").notNull(),
    status: text("status").$type<RequestStatus>().notNull().default("aguardando_analise"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
    /** Previsão de entrega, preenchida pela equipe: data pura "AAAA-MM-DD". */
    expectedOn: date("expected_on", { mode: "string" }),
    /** Quem abriu: o cliente (pelo portal) ou alguém da equipe, em nome dele. */
    createdBySide: text("created_by_side").$type<RequestSide>().notNull().default("client"),
    // O contato ou a pessoa da equipe podem ser excluídos: o nome fica copiado.
    createdByPortalUserId: text("created_by_portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdByName: text("created_by_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("client_request_status_check", sql`${table.status} in (${STATUS_VALUES})`),
    check("client_request_created_by_side_check", sql`${table.createdBySide} in ('team', 'client')`),
    index("client_request_client_idx").on(table.clientId, table.createdAt.desc()),
    index("client_request_status_idx").on(table.status),
  ],
);

/** Cada troca de status (inclusive a inicial), com quem trocou: da equipe ou o contato (cancelar). */
export const clientRequestStatusHistory = pgTable(
  "client_request_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => clientRequest.id, { onDelete: "cascade" }),
    status: text("status").$type<RequestStatus>().notNull(),
    /** De que lado veio a troca: a equipe ou o cliente (cancelar). Fica mesmo se a pessoa for excluída. */
    changedBySide: text("changed_by_side").$type<RequestSide>().notNull(),
    changedById: text("changed_by_id").references(() => user.id, { onDelete: "set null" }),
    changedByPortalUserId: text("changed_by_portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    changedByName: text("changed_by_name"),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("client_request_status_history_status_check", sql`${table.status} in (${STATUS_VALUES})`),
    check("client_request_status_history_side_check", sql`${table.changedBySide} in ('team', 'client')`),
    index("client_request_status_history_request_idx").on(table.requestId, table.changedAt.desc()),
  ],
);

/**
 * O resto do andamento (o cliente vê, junto das trocas de status): a previsão
 * de entrega informada, trocada ou tirada, e o assunto ou o briefing editados.
 * Só a equipe gera estes registros; o nome de quem fez fica copiado.
 */
export const clientRequestEvent = pgTable(
  "client_request_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => clientRequest.id, { onDelete: "cascade" }),
    type: text("type").$type<RequestEventType>().notNull(),
    /** O formato de cada tipo está em RequestEventData (src/lib/client-requests.ts). */
    data: jsonb("data").$type<RequestEventData[RequestEventType]>().notNull(),
    actorSide: text("actor_side").$type<RequestSide>().notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "client_request_event_type_check",
      sql`${table.type} in ('expected_on', 'edited', 'delivery_sent', 'delivery_answered')`,
    ),
    check("client_request_event_side_check", sql`${table.actorSide} in ('team', 'client')`),
    index("client_request_event_request_idx").on(table.requestId, table.createdAt.desc()),
  ],
);

/**
 * Entregas para aprovação: cada rodada que a equipe manda (arquivos + recado).
 * O cliente responde arquivo por arquivo (client_request_delivery_file) e, ao
 * enviar as respostas, a rodada fecha como aprovada ou com alterações pedidas.
 */
export const clientRequestDelivery = pgTable(
  "client_request_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => clientRequest.id, { onDelete: "cascade" }),
    /** Rodada 1, 2... dentro da solicitação. */
    round: integer("round").notNull(),
    /** Recado da equipe: HTML do editor, já limpo (sanitizeRichText); "" sem recado. */
    note: text("note").notNull().default(""),
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    // Quem mandou (equipe); o nome fica copiado.
    sentById: text("sent_by_id").references(() => user.id, { onDelete: "set null" }),
    sentByName: text("sent_by_name").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    // Quem enviou as respostas (contato do portal), quando a rodada fecha.
    answeredByPortalUserId: text("answered_by_portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    answeredByName: text("answered_by_name"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    // Depois de uma rodada aprovada, a equipe pode tirar do servidor os arquivos
    // das anteriores; a rodada e as respostas ficam como histórico.
    filesRemovedAt: timestamp("files_removed_at", { withTimezone: true }),
    filesRemovedByName: text("files_removed_by_name"),
  },
  (table) => [
    unique("client_request_delivery_round_unique").on(table.requestId, table.round),
    check(
      "client_request_delivery_status_check",
      sql`${table.status} in ('pending', 'approved', 'changes_requested', 'superseded')`,
    ),
  ],
);

/**
 * Os arquivos de uma rodada (no CDN, pasta "solicitacoes") e a resposta do
 * cliente a cada um. Enquanto a rodada espera, a resposta é rascunho: só a
 * equipe não vê. Excluído o arquivo do servidor, `mediaId` vira null e a linha
 * fica (com o nome copiado), para o histórico das respostas.
 */
export const clientRequestDeliveryFile = pgTable(
  "client_request_delivery_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => clientRequestDelivery.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    /** Nome do arquivo, copiado ao mandar: continua aparecendo depois que o arquivo sai do servidor. */
    name: text("name"),
    position: integer("position").notNull(),
    decision: text("decision").$type<DeliveryDecision>(),
    /** O que mudar (obrigatório quando pede alteração). */
    comment: text("comment"),
    decidedByPortalUserId: text("decided_by_portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    decidedByName: text("decided_by_name"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    unique("client_request_delivery_file_media_unique").on(table.deliveryId, table.mediaId),
    index("client_request_delivery_file_delivery_idx").on(table.deliveryId, table.position),
    check("client_request_delivery_file_decision_check", sql`${table.decision} in ('approved', 'changes')`),
  ],
);

/**
 * Conversa da solicitação, entre o cliente e a equipe: quem escreveu é da equipe
 * (authorId) ou um contato (authorPortalUserId); o nome fica copiado.
 */
export const clientRequestMessage = pgTable(
  "client_request_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => clientRequest.id, { onDelete: "cascade" }),
    /** De que lado veio: a equipe ou o cliente. Fica mesmo se quem escreveu for excluído. */
    authorSide: text("author_side").$type<RequestSide>().notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    authorPortalUserId: text("author_portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("client_request_message_side_check", sql`${table.authorSide} in ('team', 'client')`),
    index("client_request_message_request_idx").on(table.requestId, table.createdAt),
  ],
);

/** Anexos de uma mensagem (arquivos no CDN, pasta "solicitacoes"). */
export const clientRequestMessageAttachment = pgTable(
  "client_request_message_attachment",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => clientRequestMessage.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.mediaId] })],
);

/** Até quando cada pessoa da equipe já viu a solicitação (novidades e não lidas). */
export const clientRequestRead = pgTable(
  "client_request_read",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => clientRequest.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.userId] })],
);

/** O mesmo, para cada contato do portal. */
export const clientRequestPortalRead = pgTable(
  "client_request_portal_read",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => clientRequest.id, { onDelete: "cascade" }),
    portalUserId: text("portal_user_id")
      .notNull()
      .references(() => portalUser.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.portalUserId] })],
);
