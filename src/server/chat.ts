import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { chatConversation, chatMember, chatMessage, chatMessageAttachment, media, user } from "@/db/schema";

// Chat 1:1 (sem "server-only": também roda nos scripts de verificação contra
// PGlite). Toda consulta que recebe um conversationId precisa vir de quem é
// membro: as actions e a página passam antes por findConversation.

export type ChatPerson = { id: string; name: string; image: string | null; banned: boolean };

/** "a:b" com os ids em ordem: a mesma dupla sempre dá a mesma chave. */
export function chatPairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

async function findConversationIdByPair(database: Database, a: string, b: string) {
  const [found] = await database
    .select({ id: chatConversation.id })
    .from(chatConversation)
    .where(eq(chatConversation.pairKey, chatPairKey(a, b)))
    .limit(1);
  return found?.id ?? null;
}

/**
 * A conversa entre as duas pessoas, criando se ainda não existe. Conversa e
 * membros entram num comando só (atômico); se as duas abrirem ao mesmo tempo,
 * vale a que entrou primeiro.
 */
export async function openConversation(database: Database, a: string, b: string) {
  const existing = await findConversationIdByPair(database, a, b);
  if (existing) return existing;
  await database.execute(sql`
    with created as (
      insert into ${chatConversation} (id, pair_key) values (${randomUUID()}, ${chatPairKey(a, b)})
      on conflict (pair_key) do nothing
      returning id
    )
    insert into ${chatMember} (conversation_id, user_id)
    select created.id, member.user_id from created cross join (values (${a}), (${b})) as member (user_id)
  `);
  const id = await findConversationIdByPair(database, a, b);
  if (!id) throw new Error("Não foi possível abrir a conversa.");
  return id;
}

/**
 * A conversa vista por `userId` (null se não é membro): a própria leitura e a
 * outra pessoa (null se foi excluída).
 */
export async function findConversation(database: Database, conversationId: string, userId: string) {
  const members = await database
    .select({
      userId: chatMember.userId,
      lastReadAt: chatMember.lastReadAt,
      name: user.name,
      image: user.image,
      banned: user.banned,
    })
    .from(chatMember)
    .innerJoin(user, eq(user.id, chatMember.userId))
    .where(eq(chatMember.conversationId, conversationId));
  const me = members.find((member) => member.userId === userId);
  if (!me) return null;
  const other = members.find((member) => member.userId !== userId);
  return {
    id: conversationId,
    myLastReadAt: me.lastReadAt,
    other: other
      ? {
          id: other.userId,
          name: other.name,
          image: other.image,
          banned: Boolean(other.banned),
          lastReadAt: other.lastReadAt,
        }
      : null,
  };
}

export type ChatConversationRecord = NonNullable<Awaited<ReturnType<typeof findConversation>>>;

/**
 * Conversas da pessoa, a mais movimentada primeiro: com quem, a última mensagem e
 * quantas não lidas. Só as que já têm mensagem, além de `includeId` (a aberta agora).
 */
export async function listConversations(database: Database, userId: string, includeId?: string) {
  const mine = await database
    .select({
      id: chatConversation.id,
      lastMessageAt: chatConversation.lastMessageAt,
      lastReadAt: chatMember.lastReadAt,
    })
    .from(chatMember)
    .innerJoin(chatConversation, eq(chatConversation.id, chatMember.conversationId))
    .where(
      and(
        eq(chatMember.userId, userId),
        includeId
          ? or(isNotNull(chatConversation.lastMessageAt), eq(chatConversation.id, includeId))
          : isNotNull(chatConversation.lastMessageAt),
      ),
    )
    .orderBy(sql`${chatConversation.lastMessageAt} desc nulls first`);
  if (mine.length === 0) return [];
  const ids = mine.map((row) => row.id);

  const [others, lastMessages, unread] = await Promise.all([
    database
      .select({
        conversationId: chatMember.conversationId,
        id: user.id,
        name: user.name,
        image: user.image,
        banned: user.banned,
      })
      .from(chatMember)
      .innerJoin(user, eq(user.id, chatMember.userId))
      .where(and(inArray(chatMember.conversationId, ids), ne(chatMember.userId, userId))),
    // A última mensagem de cada conversa.
    database
      .selectDistinctOn([chatMessage.conversationId], {
        conversationId: chatMessage.conversationId,
        authorId: chatMessage.authorId,
        authorName: chatMessage.authorName,
        body: chatMessage.body,
        createdAt: chatMessage.createdAt,
        attachments: sql<number>`(select count(*) from ${chatMessageAttachment} where ${chatMessageAttachment.messageId} = ${chatMessage.id})`.mapWith(
          Number,
        ),
      })
      .from(chatMessage)
      .where(inArray(chatMessage.conversationId, ids))
      .orderBy(chatMessage.conversationId, desc(chatMessage.createdAt)),
    // Não lidas: mensagens da outra pessoa depois da minha última leitura.
    database
      .select({ conversationId: chatMessage.conversationId, total: count() })
      .from(chatMessage)
      .innerJoin(
        chatMember,
        and(eq(chatMember.conversationId, chatMessage.conversationId), eq(chatMember.userId, userId)),
      )
      .where(
        and(
          inArray(chatMessage.conversationId, ids),
          sql`${chatMessage.authorId} is distinct from ${userId}`,
          gt(chatMessage.createdAt, sql`coalesce(${chatMember.lastReadAt}, 'epoch')`),
        ),
      )
      .groupBy(chatMessage.conversationId),
  ]);

  return mine.map((row) => {
    const other = others.find((item) => item.conversationId === row.id);
    const last = lastMessages.find((item) => item.conversationId === row.id);
    return {
      id: row.id,
      lastMessageAt: row.lastMessageAt,
      other: other
        ? { id: other.id, name: other.name, image: other.image, banned: Boolean(other.banned) }
        : null,
      lastMessage: last ?? null,
      unread: unread.find((item) => item.conversationId === row.id)?.total ?? 0,
    };
  });
}

export type ChatConversationListItem = Awaited<ReturnType<typeof listConversations>>[number];

/** Quantas conversas têm mensagem não lida (o número no "Chat" da sidebar). */
export async function countUnreadConversations(database: Database, userId: string) {
  const [{ total }] = await database
    .select({ total: sql<number>`count(distinct ${chatMessage.conversationId})`.mapWith(Number) })
    .from(chatMessage)
    .innerJoin(
      chatMember,
      and(eq(chatMember.conversationId, chatMessage.conversationId), eq(chatMember.userId, userId)),
    )
    .where(
      and(
        sql`${chatMessage.authorId} is distinct from ${userId}`,
        gt(chatMessage.createdAt, sql`coalesce(${chatMember.lastReadAt}, 'epoch')`),
      ),
    );
  return total;
}

/**
 * Mensagens em ordem de envio, cada uma com os anexos: as `limit` mais recentes,
 * ou as anteriores a `before` (para "Carregar mensagens anteriores").
 */
export async function listChatMessages(
  database: Database,
  conversationId: string,
  { limit, before }: { limit: number; before?: Date },
) {
  const newestFirst = await database
    .select({
      id: chatMessage.id,
      authorId: chatMessage.authorId,
      authorName: chatMessage.authorName,
      authorImage: user.image,
      body: chatMessage.body,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .leftJoin(user, eq(user.id, chatMessage.authorId))
    .where(and(eq(chatMessage.conversationId, conversationId), before ? lt(chatMessage.createdAt, before) : undefined))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(limit + 1);
  const rows = newestFirst.slice(0, limit).reverse();
  const attachments = rows.length
    ? await database
        .select({
          messageId: chatMessageAttachment.messageId,
          id: media.id,
          key: media.key,
          name: media.name,
          type: media.type,
          size: media.size,
        })
        .from(chatMessageAttachment)
        .innerJoin(media, eq(media.id, chatMessageAttachment.mediaId))
        .where(inArray(chatMessageAttachment.messageId, rows.map((row) => row.id)))
        .orderBy(asc(media.createdAt))
    : [];
  return {
    messages: rows.map((row) => ({
      ...row,
      attachments: attachments.filter((item) => item.messageId === row.id),
    })),
    hasMore: newestFirst.length > limit,
  };
}

export type ChatMessageItem = Awaited<ReturnType<typeof listChatMessages>>["messages"][number];

export async function findChatMessage(database: Database, messageId: string) {
  const [found] = await database.select().from(chatMessage).where(eq(chatMessage.id, messageId)).limit(1);
  return found ?? null;
}

/** Marca a conversa como lida até `at` (nunca volta atrás). Devolve a leitura gravada. */
export async function markConversationRead(database: Database, conversationId: string, userId: string, at: Date) {
  const [updated] = await database
    .update(chatMember)
    .set({ lastReadAt: sql`greatest(coalesce(${chatMember.lastReadAt}, 'epoch'), ${at.toISOString()}::timestamptz)` })
    .where(and(eq(chatMember.conversationId, conversationId), eq(chatMember.userId, userId)))
    .returning({ lastReadAt: chatMember.lastReadAt });
  return updated?.lastReadAt ?? null;
}

/** Chaves no CDN dos anexos de uma mensagem (para apagar junto). */
export async function listChatAttachmentKeys(database: Database, messageId: string) {
  const rows = await database
    .select({ key: media.key })
    .from(chatMessageAttachment)
    .innerJoin(media, eq(media.id, chatMessageAttachment.mediaId))
    .where(eq(chatMessageAttachment.messageId, messageId));
  return rows.map((row) => row.key);
}

/** Anexo já usado em alguma mensagem do chat (não pode ser descartado nem reaproveitado). */
export async function isChatAttachmentInUse(database: Database, mediaIds: string[]) {
  if (mediaIds.length === 0) return false;
  const [found] = await database
    .select({ messageId: chatMessageAttachment.messageId })
    .from(chatMessageAttachment)
    .where(inArray(chatMessageAttachment.mediaId, mediaIds))
    .limit(1);
  return Boolean(found);
}
