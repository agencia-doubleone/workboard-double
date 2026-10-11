import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import type { AchievementRecordKind } from "@/lib/achievements";
import { user } from "./auth";

// Conquistas (src/lib/achievements.ts tem o catálogo; aqui só o que cada pessoa
// fez e desbloqueou). Tudo conta a partir do lançamento: o que já estava no
// banco antes (mensagens, reações...) só entra nas contas se for depois de
// `achievement_launch.launched_at`.

/** Uma linha só: quando as conquistas começaram a contar (gravada pela migration). */
export const achievementLaunch = pgTable(
  "achievement_launch",
  {
    id: boolean("id").primaryKey().default(true),
    launchedAt: timestamp("launched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("achievement_launch_single", sql`${table.id}`)],
);

/** Conquista desbloqueada. Nunca é tirada (só a concedida por um admin pode ser retirada por um admin). */
export const userAchievement = pgTable(
  "user_achievement",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).defaultNow().notNull(),
    /** Quando o aviso apareceu numa tela; null = ainda não viu (aparece na próxima). */
    seenAt: timestamp("seen_at", { withTimezone: true }),
    /** Concedida à mão por um admin (Caçador de Bugs). */
    grantedById: text("granted_by_id").references(() => user.id, { onDelete: "set null" }),
    grantedByName: text("granted_by_name"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.achievementId] }),
    index("user_achievement_achievement_idx").on(table.achievementId),
  ],
);

/**
 * O que conta uma vez cada coisa e o banco não guarda de outro jeito: trabalho
 * concluído, mês finalizado, cor experimentada, seção visitada, resultado da
 * busca aberto, post-it criado. A chave (pessoa, tipo, ref) impede contar duas vezes.
 */
export const achievementRecord = pgTable(
  "achievement_record",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AchievementRecordKind>().notNull(),
    refId: text("ref_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    /** Trabalho concluído: entregue até o dia da entrega? (null: sem data de entrega). */
    onTime: boolean("on_time"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.kind, table.refId] }),
    index("achievement_record_kind_ref_idx").on(table.kind, table.refId),
  ],
);

/** Contadores do que só o navegador vê (abrir a busca pelo atalho, visitas ao perfil). */
export const achievementCounter = pgTable(
  "achievement_counter",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

/** Livro de visitas da página secreta (/bastidores): uma assinatura por pessoa. */
export const guestbookEntry = pgTable("guestbook_entry", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  message: text("message"),
  signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),
});
