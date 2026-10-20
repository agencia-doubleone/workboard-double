import { relations } from "drizzle-orm";
import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { client } from "./clients";

// Portal do cliente: um segundo Better Auth, com tabelas e cookie próprios
// (src/lib/portal-auth-config.ts). O contato do cliente nunca é um `user` do
// time, então nenhuma tela ou consulta da equipe enxerga essas contas.
// As chaves em camelCase precisam bater com os nomes de campo do Better Auth;
// os nomes das chaves do objeto (portalUser...) são os `modelName` da config.

export const portalUser = pgTable(
  "portal_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Único: um contato pertence a um cliente só. */
    email: text("email").notNull().unique(),
    /** Vira true no primeiro login com o código (o código prova o e-mail). */
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Do Workboard (o Better Auth não lê nem grava):
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    /** Aprova ou pede ajustes nas entregas (vale quando as solicitações existirem). */
    canApprove: boolean("can_approve").default(true).notNull(),
    /** Desativado: não recebe código nem passa pela sessão. */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    /** Último convite mandado por e-mail. */
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("portal_user_client_idx").on(table.clientId)],
);

export const portalSession = pgTable(
  "portal_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => portalUser.id, { onDelete: "cascade" }),
  },
  (table) => [index("portal_session_user_id_idx").on(table.userId)],
);

/** O Better Auth exige a tabela; com o login por código ela fica vazia. */
export const portalAccount = pgTable(
  "portal_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => portalUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("portal_account_user_id_idx").on(table.userId)],
);

/** Os códigos de entrada (guardados com hash). */
export const portalVerification = pgTable(
  "portal_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("portal_verification_identifier_idx").on(table.identifier)],
);

export const portalRateLimit = pgTable("portal_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const portalUserRelations = relations(portalUser, ({ many, one }) => ({
  sessions: many(portalSession),
  accounts: many(portalAccount),
  client: one(client, { fields: [portalUser.clientId], references: [client.id] }),
}));

export const portalSessionRelations = relations(portalSession, ({ one }) => ({
  user: one(portalUser, { fields: [portalSession.userId], references: [portalUser.id] }),
}));

export const portalAccountRelations = relations(portalAccount, ({ one }) => ({
  user: one(portalUser, { fields: [portalAccount.userId], references: [portalUser.id] }),
}));
