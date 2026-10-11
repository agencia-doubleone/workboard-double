import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import type { Database } from "@/db";
import {
  chatMember,
  chatMessage,
  chatMessageAttachment,
  chatMessageFavorite,
  chatMessageReaction,
  job,
  jobAssignee,
  jobMessage,
  jobMessageAttachment,
  jobMessageFavorite,
  jobMessageReaction,
  media,
  user,
} from "@/db/schema";
import type { ReactionEntry } from "@/lib/messages";

// Reações, fixadas e favoritas das mensagens dos trabalhos e do chat (sem
// "server-only": também roda nos scripts contra PGlite). Não confere acesso:
// quem chama já passou por findAccessibleJob (trabalhos) ou findConversation (chat).

export type MessageKind = "job" | "chat";

// As tabelas de reação e de favoritas têm as mesmas colunas nos dois tipos; o
// cast só une os tipos (cada coluna continua sendo da própria tabela).
const reactionTable = (kind: MessageKind) =>
  kind === "job" ? jobMessageReaction : (chatMessageReaction as unknown as typeof jobMessageReaction);
const favoriteTable = (kind: MessageKind) =>
  kind === "job" ? jobMessageFavorite : (chatMessageFavorite as unknown as typeof jobMessageFavorite);

/** Liga ou desliga a reação da pessoa. Devolve true se ela ficou ligada. */
export async function toggleReaction(
  database: Database,
  kind: MessageKind,
  input: { messageId: string; userId: string; emoji: string },
) {
  const table = reactionTable(kind);
  const removed = await database
    .delete(table)
    .where(and(eq(table.messageId, input.messageId), eq(table.userId, input.userId), eq(table.emoji, input.emoji)))
    .returning({ emoji: table.emoji });
  if (removed.length > 0) return false;
  await database.insert(table).values(input).onConflictDoNothing();
  return true;
}

/** Guarda nas favoritas da pessoa, ou tira se já estava. Devolve true se ficou favorita. */
export async function toggleFavorite(database: Database, kind: MessageKind, input: { messageId: string; userId: string }) {
  const table = favoriteTable(kind);
  const removed = await database
    .delete(table)
    .where(and(eq(table.messageId, input.messageId), eq(table.userId, input.userId)))
    .returning({ messageId: table.messageId });
  if (removed.length > 0) return false;
  await database.insert(table).values(input).onConflictDoNothing();
  return true;
}

/** As reações (por mensagem, na ordem em que vieram) e quais `viewerId` guardou nas favoritas. */
export async function listMessageExtras(database: Database, kind: MessageKind, messageIds: string[], viewerId: string) {
  const reactions = new Map<string, ReactionEntry[]>();
  const favorites = new Set<string>();
  if (messageIds.length === 0) return { reactions, favorites };
  const reaction = reactionTable(kind);
  const favorite = favoriteTable(kind);
  const [reactionRows, favoriteRows] = await Promise.all([
    database
      .select({ messageId: reaction.messageId, emoji: reaction.emoji, userId: reaction.userId, name: user.name })
      .from(reaction)
      .innerJoin(user, eq(user.id, reaction.userId))
      .where(inArray(reaction.messageId, messageIds))
      .orderBy(asc(reaction.createdAt)),
    database
      .select({ messageId: favorite.messageId })
      .from(favorite)
      .where(and(eq(favorite.userId, viewerId), inArray(favorite.messageId, messageIds))),
  ]);
  for (const row of reactionRows) {
    reactions.set(row.messageId, [...(reactions.get(row.messageId) ?? []), row]);
  }
  for (const row of favoriteRows) favorites.add(row.messageId);
  return { reactions, favorites };
}

export type MessageExtras = Awaited<ReturnType<typeof listMessageExtras>>;

/** Fixa (com quem fixou) ou desafixa (`actor` null). */
export async function setMessagePinned(
  database: Database,
  kind: MessageKind,
  messageId: string,
  actor: { id: string; name: string } | null,
) {
  const values = actor
    ? { pinnedAt: new Date(), pinnedById: actor.id, pinnedByName: actor.name }
    : { pinnedAt: null, pinnedById: null, pinnedByName: null };
  if (kind === "job") await database.update(jobMessage).set(values).where(eq(jobMessage.id, messageId));
  else await database.update(chatMessage).set(values).where(eq(chatMessage.id, messageId));
}

/** Quantas mensagens estão fixadas no trabalho ou na conversa. */
export async function countPinnedMessages(database: Database, kind: MessageKind, parentId: string) {
  const [row] =
    kind === "job"
      ? await database
          .select({ total: count() })
          .from(jobMessage)
          .where(and(eq(jobMessage.jobId, parentId), isNotNull(jobMessage.pinnedAt)))
      : await database
          .select({ total: count() })
          .from(chatMessage)
          .where(and(eq(chatMessage.conversationId, parentId), isNotNull(chatMessage.pinnedAt)));
  return row?.total ?? 0;
}

/** As fixadas do trabalho ou da conversa, a mais recente primeiro (podem ser mais antigas que as carregadas). */
export async function listPinnedMessages(database: Database, kind: MessageKind, parentId: string) {
  const rows =
    kind === "job"
      ? await database
          .select({
            id: jobMessage.id,
            authorId: jobMessage.authorId,
            authorName: jobMessage.authorName,
            body: jobMessage.body,
            createdAt: jobMessage.createdAt,
            pinnedAt: jobMessage.pinnedAt,
            pinnedByName: jobMessage.pinnedByName,
          })
          .from(jobMessage)
          .where(and(eq(jobMessage.jobId, parentId), isNotNull(jobMessage.pinnedAt)))
          .orderBy(desc(jobMessage.pinnedAt))
      : await database
          .select({
            id: chatMessage.id,
            authorId: chatMessage.authorId,
            authorName: chatMessage.authorName,
            body: chatMessage.body,
            createdAt: chatMessage.createdAt,
            pinnedAt: chatMessage.pinnedAt,
            pinnedByName: chatMessage.pinnedByName,
          })
          .from(chatMessage)
          .where(and(eq(chatMessage.conversationId, parentId), isNotNull(chatMessage.pinnedAt)))
          .orderBy(desc(chatMessage.pinnedAt));
  const attachments = await countAttachments(database, kind, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, pinnedAt: row.pinnedAt!, attachments: attachments.get(row.id) ?? 0 }));
}

export type PinnedMessage = Awaited<ReturnType<typeof listPinnedMessages>>[number];

async function countAttachments(database: Database, kind: MessageKind, messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, number>();
  const rows =
    kind === "job"
      ? await database
          .select({ messageId: jobMessageAttachment.messageId, total: count() })
          .from(jobMessageAttachment)
          .where(inArray(jobMessageAttachment.messageId, messageIds))
          .groupBy(jobMessageAttachment.messageId)
      : await database
          .select({ messageId: chatMessageAttachment.messageId, total: count() })
          .from(chatMessageAttachment)
          .where(inArray(chatMessageAttachment.messageId, messageIds))
          .groupBy(chatMessageAttachment.messageId);
  return new Map(rows.map((row) => [row.messageId, row.total]));
}

const FAVORITES_LIMIT = 200;

/**
 * As favoritas da pessoa, a guardada mais recente primeiro, com de onde vieram.
 * Só as que ela ainda pode ler: trabalho em que está (ou qualquer um, se admin)
 * e conversa da qual ainda faz parte.
 */
export async function listFavoriteMessages(database: Database, viewer: { id: string; isAdmin: boolean }) {
  const [jobRows, chatRows] = await Promise.all([
    database
      .select({
        id: jobMessage.id,
        authorId: jobMessage.authorId,
        authorName: jobMessage.authorName,
        authorImage: user.image,
        body: jobMessage.body,
        createdAt: jobMessage.createdAt,
        favoritedAt: jobMessageFavorite.createdAt,
        job: { id: job.id, pit: job.pit, name: job.name },
      })
      .from(jobMessageFavorite)
      .innerJoin(jobMessage, eq(jobMessage.id, jobMessageFavorite.messageId))
      .innerJoin(job, eq(job.id, jobMessage.jobId))
      .leftJoin(user, eq(user.id, jobMessage.authorId))
      .where(
        and(
          eq(jobMessageFavorite.userId, viewer.id),
          viewer.isAdmin
            ? undefined
            : sql`exists (select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${viewer.id})`,
        ),
      )
      .orderBy(desc(jobMessageFavorite.createdAt))
      .limit(FAVORITES_LIMIT),
    database
      .select({
        id: chatMessage.id,
        authorId: chatMessage.authorId,
        authorName: chatMessage.authorName,
        authorImage: user.image,
        body: chatMessage.body,
        createdAt: chatMessage.createdAt,
        favoritedAt: chatMessageFavorite.createdAt,
        conversationId: chatMessage.conversationId,
      })
      .from(chatMessageFavorite)
      .innerJoin(chatMessage, eq(chatMessage.id, chatMessageFavorite.messageId))
      .innerJoin(
        chatMember,
        and(eq(chatMember.conversationId, chatMessage.conversationId), eq(chatMember.userId, viewer.id)),
      )
      .leftJoin(user, eq(user.id, chatMessage.authorId))
      .where(eq(chatMessageFavorite.userId, viewer.id))
      .orderBy(desc(chatMessageFavorite.createdAt))
      .limit(FAVORITES_LIMIT),
  ]);

  const conversationIds = [...new Set(chatRows.map((row) => row.conversationId))];
  const [others, jobFiles, chatFiles] = await Promise.all([
    conversationIds.length
      ? database
          .select({ conversationId: chatMember.conversationId, name: user.name, image: user.image })
          .from(chatMember)
          .innerJoin(user, eq(user.id, chatMember.userId))
          .where(and(inArray(chatMember.conversationId, conversationIds), ne(chatMember.userId, viewer.id)))
      : Promise.resolve([]),
    listAttachments(database, "job", jobRows.map((row) => row.id)),
    listAttachments(database, "chat", chatRows.map((row) => row.id)),
  ]);

  const items = [
    ...jobRows.map((row) => ({
      kind: "job" as const,
      ...row,
      attachments: jobFiles.get(row.id) ?? [],
    })),
    ...chatRows.map((row) => {
      const other = others.find((item) => item.conversationId === row.conversationId) ?? null;
      return {
        kind: "chat" as const,
        ...row,
        conversation: { id: row.conversationId, otherName: other?.name ?? null, otherImage: other?.image ?? null },
        attachments: chatFiles.get(row.id) ?? [],
      };
    }),
  ];
  return items.sort((a, b) => b.favoritedAt.getTime() - a.favoritedAt.getTime()).slice(0, FAVORITES_LIMIT);
}

export type FavoriteMessage = Awaited<ReturnType<typeof listFavoriteMessages>>[number];

async function listAttachments(database: Database, kind: MessageKind, messageIds: string[]) {
  const map = new Map<string, { id: string; key: string; name: string; type: string; size: number }[]>();
  if (messageIds.length === 0) return map;
  const link = kind === "job" ? jobMessageAttachment : (chatMessageAttachment as unknown as typeof jobMessageAttachment);
  const rows = await database
    .select({ messageId: link.messageId, id: media.id, key: media.key, name: media.name, type: media.type, size: media.size })
    .from(link)
    .innerJoin(media, eq(media.id, link.mediaId))
    .where(inArray(link.messageId, messageIds))
    .orderBy(asc(media.createdAt));
  for (const { messageId, ...file } of rows) map.set(messageId, [...(map.get(messageId) ?? []), file]);
  return map;
}
