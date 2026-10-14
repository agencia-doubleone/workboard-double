import { date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { PlanningStatus, PostKind, PostSlide, PostScene, SocialNetwork } from "@/lib/planning";
import { user } from "./auth";
import { client } from "./clients";

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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("planning_post_month_idx").on(table.monthId, table.date, table.position)],
);
