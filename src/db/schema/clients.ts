import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Clientes da agência. Ninguém apaga: quem sai é arquivado (archivedAt), para
// os trabalhos ligados a ele continuarem com o histórico.
export const client = pgTable(
  "client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Endereço da página (/clientes/{slug}). Gerado do nome e fixo depois de criado. */
    slug: text("slug").notNull().unique(),
    /** Chave do logo no CDN (pasta "clientes"), como user.image. */
    logoKey: text("logo_key"),
    website: text("website"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    linkedin: text("linkedin"),
    youtube: text("youtube"),
    // Público-alvo
    ageMin: integer("age_min").default(0).notNull(),
    ageMax: integer("age_max").default(100).notNull(),
    genders: text("genders").array().default([]).notNull(),
    socialClasses: text("social_classes").array().default([]).notNull(),
    /** "Informações gerais": HTML do editor, já limpo no servidor (src/server/rich-text.ts). */
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("client_name_idx").on(table.name)],
);

// Cofre de senhas de cada cliente. Senha e observações ficam cifradas
// (AES-256-GCM, src/server/vault.ts); só admins decifram, e cada leitura é auditada.
export const clientCredential = pgTable(
  "client_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    url: text("url"),
    username: text("username"),
    passwordEncrypted: text("password_encrypted").notNull(),
    notesEncrypted: text("notes_encrypted"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("client_credential_client_idx").on(table.clientId, table.service)],
);
