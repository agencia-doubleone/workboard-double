import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { media } from "./media";

// Chat interno: conversas 1:1. Só quem está na conversa lê (nem admins veem as
// dos outros). Excluir uma pessoa tira ela da conversa, mas as mensagens ficam
// para a outra, com o nome copiado.

export const chatConversation = pgTable("chat_conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Os dois ids em ordem, "a:b" (chatPairKey): uma conversa por dupla. */
  pairKey: text("pair_key").notNull().unique(),
  /** Ordena a lista de conversas; null = aberta e ainda sem mensagens. */
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Quem está na conversa e até quando leu (as não lidas e o "Visto" saem daqui). */
export const chatMember = pgTable(
  "chat_member",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index("chat_member_user_idx").on(table.userId),
  ],
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversation.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("chat_message_conversation_idx").on(table.conversationId, table.createdAt)],
);

/** Anexos de uma mensagem do chat (arquivos no CDN, pasta "chat"). */
export const chatMessageAttachment = pgTable(
  "chat_message_attachment",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessage.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.mediaId] })],
);
