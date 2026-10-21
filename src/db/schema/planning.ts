import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  ApprovalStage,
  ArtRole,
  ArtState,
  BriefCaption,
  BriefState,
  DecisionSide,
  PlanningPostEventData,
  PlanningPostEventType,
  PlanningSendPostState,
  PlanningSendStatus,
  PlanningStatus,
  PostKind,
  PostSlide,
  PostScene,
  ReviewDecision,
  SocialNetwork,
} from "@/lib/planning";
import { user } from "./auth";
import { client } from "./clients";
import { media } from "./media";
import { portalUser } from "./portal";

// Planejamentos de redes sociais: um por cliente, contínuo mês a mês. Toda a
// equipe vê e edita; os responsáveis recebem os avisos de mudança de status.

export const planning = pgTable("planning", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Cliente nunca é excluído (só arquivado): restrict protege o planejamento.
  clientId: uuid("client_id")
    .notNull()
    .unique()
    .references(() => client.id, { onDelete: "restrict" }),
  /** Redes atendidas; a primeira é o padrão dos posts novos. */
  networks: text("networks").array().$type<SocialNetwork[]>().default([]).notNull(),
  /** Meta de posts por mês (null = sem meta). */
  postsPerMonth: integer("posts_per_month"),
  /** Informações gerais (objetivo, tom de voz, público...): HTML do editor, já limpo (sanitizeRichText). */
  overview: text("overview"),
  /** "Aprovar pauta": o cliente aprova o texto dos posts antes das artes (sem isso, só as artes). */
  approvesBrief: boolean("approves_brief").notNull().default(false),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Responsáveis: recebem os avisos de mudança de status do planejamento. */
export const planningMember = pgTable(
  "planning_member",
  {
    planningId: uuid("planning_id")
      .notNull()
      .references(() => planning.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.planningId, table.userId] }), index("planning_member_user_idx").on(table.userId)],
);

/** Um mês do planejamento. Nasce quando alguém mexe nele (status, conceito, posts). */
export const planningMonth = pgTable(
  "planning_month",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planningId: uuid("planning_id")
      .notNull()
      .references(() => planning.id, { onDelete: "cascade" }),
    /** "AAAA-MM" */
    month: text("month").notNull(),
    status: text("status").$type<PlanningStatus>().notNull().default("producao"),
    /** "Conceito editorial do mês" (texto simples). */
    concept: text("concept"),
    /** O texto colado do Word, dos meses importados antes do JSON (só leitura; a importação nova não grava). */
    document: text("document"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
    /** Última vez que o mês foi para "Ajustes pedidos" (null: nunca). A conquista "Aprovado de Primeira" depende disso. */
    adjustmentsRequestedAt: timestamp("adjustments_requested_at", { withTimezone: true }),
    /** Primeira vez que algo do mês foi ao cliente: o portal só mostra meses com isso. */
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique("planning_month_planning_month_unique").on(table.planningId, table.month), index("planning_month_month_idx").on(table.month)],
);

/** Um post do mês. A ordem na tela é a data e, no mesmo dia (ou sem data), `position`. */
export const planningPost = pgTable(
  "planning_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monthId: uuid("month_id")
      .notNull()
      .references(() => planningMonth.id, { onDelete: "cascade" }),
    position: doublePrecision("position").notNull().default(0),
    /** Dia da publicação, "AAAA-MM-DD". */
    date: date("date", { mode: "string" }),
    network: text("network").$type<SocialNetwork>(),
    // Os campos do JSON padrão (src/lib/planning-json.ts).
    kind: text("kind").$type<PostKind>().notNull().default("estatico"),
    headline: text("headline").notNull().default(""),
    /** "Texto de apoio" da arte. */
    supportText: text("support_text"),
    /** A legenda (sem o CTA e as hashtags, que têm campo próprio; composeCaption junta os três). */
    copy: text("copy").notNull().default(""),
    cta: text("cta"),
    hashtags: text("hashtags").array().notNull().default([]),
    /** Carrossel e Stories. */
    slides: jsonb("slides").$type<PostSlide[]>().notNull().default([]),
    /** Reels e Vídeo. */
    scenes: jsonb("scenes").$type<PostScene[]>().notNull().default([]),
    /** Observações: o que os posts do formato antigo tinham sem campo próprio (tema, formato, seções). */
    notes: text("notes"),
    status: text("status").$type<PlanningStatus>().notNull().default("producao"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
    // Aprovação (docs/planejamentos-no-portal.md). A pauta só conta com planning.approvesBrief.
    briefState: text("brief_state").$type<BriefState>().notNull().default("rascunho"),
    briefDecidedAt: timestamp("brief_decided_at", { withTimezone: true }),
    briefDecidedByName: text("brief_decided_by_name"),
    briefDecidedBySide: text("brief_decided_by_side").$type<DecisionSide>(),
    /** A legenda como estava quando a pauta foi aprovada (a final pode ser revisada até as artes). */
    briefCaption: jsonb("brief_caption").$type<BriefCaption>(),
    artState: text("art_state").$type<ArtState>().notNull().default("sem_arte"),
    artDecidedAt: timestamp("art_decided_at", { withTimezone: true }),
    artDecidedByName: text("art_decided_by_name"),
    artDecidedBySide: text("art_decided_by_side").$type<DecisionSide>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("planning_post_month_idx").on(table.monthId, table.date, table.position)],
);

/**
 * As artes de um post (no CDN, pasta "planejamentos"), na ordem. A versão atual
 * é a maior; trocar uma arte que já foi ao cliente cria a versão seguinte e a
 * anterior fica no histórico (o comentário dele fala dela). O arquivo pode sair
 * do CDN sem a linha: `mediaId` vira null e fica o nome copiado.
 */
export const planningPostAsset = pgTable(
  "planning_post_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => planningPost.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    role: text("role").$type<ArtRole>().notNull(),
    position: integer("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("planning_post_asset_post_idx").on(table.postId, table.version, table.position),
    index("planning_post_asset_media_idx").on(table.mediaId),
  ],
);

/**
 * Respostas sobre um post numa etapa: do cliente pelo portal ou registradas por
 * um admin em nome dele (sem envio). `submittedAt` null = rascunho do cliente,
 * que a equipe ainda não vê. `sendId` aponta para o envio (a tabela dos envios vem depois).
 */
export const planningReview = pgTable(
  "planning_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => planningPost.id, { onDelete: "cascade" }),
    sendId: uuid("send_id").references(() => planningSend.id, { onDelete: "set null" }),
    /** O post dentro do envio que esta resposta responde (null: registrada pela equipe sem envio). */
    sendPostId: uuid("send_post_id").references(() => planningSendPost.id, { onDelete: "cascade" }),
    stage: text("stage").$type<ApprovalStage>().notNull(),
    decision: text("decision").$type<ReviewDecision>().notNull(),
    comment: text("comment"),
    side: text("side").$type<DecisionSide>().notNull(),
    portalUserId: text("portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    index("planning_review_post_idx").on(table.postId, table.stage, table.createdAt),
    // Um rascunho por post do envio, que os contatos do cliente completam ou mudam juntos.
    uniqueIndex("planning_review_draft_idx")
      .on(table.sendPostId)
      .where(sql`${table.submittedAt} is null`),
  ],
);

/**
 * O que a equipe manda de uma vez ao cliente: um mês, uma etapa e os posts
 * escolhidos, com um recado opcional. Fica "answered" quando todos os posts
 * dele foram respondidos; retirar só enquanto nenhuma resposta foi enviada.
 */
export const planningSend = pgTable(
  "planning_send",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monthId: uuid("month_id")
      .notNull()
      .references(() => planningMonth.id, { onDelete: "cascade" }),
    stage: text("stage").$type<ApprovalStage>().notNull(),
    /** Recado em texto rico, já limpo (sanitizeRichText). */
    note: text("note"),
    status: text("status").$type<PlanningSendStatus>().notNull().default("pending"),
    sentById: text("sent_by_id").references(() => user.id, { onDelete: "set null" }),
    sentByName: text("sent_by_name").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [index("planning_send_month_idx").on(table.monthId, table.stage, table.status)],
);

/**
 * Os posts de um envio. Um post só fica em um envio pendente por etapa (índice
 * único parcial). Guarda a situação de antes (para retirar) e, na arte, a versão
 * enviada (o cliente vê essa até a próxima ir).
 */
export const planningSendPost = pgTable(
  "planning_send_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sendId: uuid("send_id")
      .notNull()
      .references(() => planningSend.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => planningPost.id, { onDelete: "cascade" }),
    stage: text("stage").$type<ApprovalStage>().notNull(),
    state: text("state").$type<PlanningSendPostState>().notNull().default("pending"),
    previousState: text("previous_state").notNull(),
    artVersion: integer("art_version"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [
    index("planning_send_post_send_idx").on(table.sendId),
    uniqueIndex("planning_send_post_pending_idx")
      .on(table.postId, table.stage)
      .where(sql`${table.state} = 'pending'`),
  ],
);

/** Cada "Enviar respostas" do cliente: quantos aprovados e com alteração, e o recado geral. */
export const planningAnswer = pgTable(
  "planning_answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monthId: uuid("month_id")
      .notNull()
      .references(() => planningMonth.id, { onDelete: "cascade" }),
    note: text("note"),
    approved: integer("approved").notNull().default(0),
    changes: integer("changes").notNull().default(0),
    portalUserId: text("portal_user_id").references(() => portalUser.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("planning_answer_month_idx").on(table.monthId, table.createdAt)],
);

/** Histórico do post fora das respostas: aprovação mantida ou tirada numa edição, data trocada... */
export const planningPostEvent = pgTable(
  "planning_post_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => planningPost.id, { onDelete: "cascade" }),
    type: text("type").$type<PlanningPostEventType>().notNull(),
    data: jsonb("data").$type<PlanningPostEventData>().notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("planning_post_event_post_idx").on(table.postId, table.createdAt)],
);
