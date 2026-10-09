import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Arquivos guardados no CDN (KingHost). O arquivo mora em
// {MEDIA_CDN_URL}/uploads/{key}; a URL é montada na leitura para o domínio
// poder mudar sem migrar dados.
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    folder: text("folder").notNull(),
    /** Nome original, como a pessoa enviou. */
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    // Excluir o usuário não apaga os arquivos dele; quem enviou continua na auditoria.
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("media_folder_created_at_idx").on(table.folder, table.createdAt.desc()),
    index("media_uploaded_by_idx").on(table.uploadedById),
  ],
);
