import { date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { PlanningStatus, PostSection, SocialNetwork } from "@/lib/planning";
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
    /** O texto colado do Word, guardado como veio (referência). */
    document: text("document"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
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
    /** Formato como escrito ("Card estático", "Carrossel — 3 cards", "Reel — 30 s"). */
    format: text("format"),
    /** Tema do cabeçalho do documento (ex.: "DIREITO EMPRESARIAL"). */
    topic: text("topic"),
    headline: text("headline").notNull().default(""),
    /** A legenda (copy, com CTA e hashtags). */
    copy: text("copy").notNull().default(""),
    /** Seções livres, na ordem: Tema central, Texto de apoio, Abordagem, Roteiro... */
    sections: jsonb("sections").$type<PostSection[]>().notNull().default([]),
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
