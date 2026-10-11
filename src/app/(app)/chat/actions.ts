"use server";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { chatConversation, chatMember, chatMessage, chatMessageAttachment } from "@/db/schema";
import { CHAT_PAGE_SIZE } from "@/lib/chat";
import { normalizeMessageBody, PINNED_MESSAGES_MAX, toReactionViews, type MessageUpdateResult } from "@/lib/messages";
import { getSession } from "@/lib/session";
import {
  chatMessageTargetSchema,
  conversationTargetSchema,
  olderChatMessagesSchema,
  sendChatMessageSchema,
  startConversationSchema,
  type SendChatMessageInput,
} from "@/lib/validations/chat";
import { messageFavoriteSchema, messagePinSchema, messageReactionSchema } from "@/lib/validations/messages";
import {
  achievementsAfter,
  onMessageDeleted,
  onMessageFavorited,
  onMessagePinned,
  onMessageSent,
  onReactionAdded,
} from "@/server/achievements";
import { getRequestMeta } from "@/server/audit";
import {
  findChatMessage,
  findConversation,
  isChatAttachmentInUse,
  listChatAttachmentKeys,
  listChatMessages,
  markConversationRead as markRead,
  openConversation,
  type ChatConversationRecord,
} from "@/server/chat";
import { filterActiveUserIds } from "@/server/jobs";
import { deleteMedia, deleteMediaByKey, findMediaById, resolveMediaUrl } from "@/server/media";
import {
  countPinnedMessages,
  listMessageExtras,
  setMessagePinned,
  toggleFavorite,
  toggleReaction,
} from "@/server/messages";
import { publishRealtimeAfter } from "@/server/realtime";
import { messagePreview, toChatMessageView } from "./present";

// Chat 1:1. Só quem está na conversa lê, escreve e marca como lida; nem admins
// veem as conversas dos outros. Cada mensagem avisa as duas pessoas em tempo
// real (a outra recebe o aviso; a própria atualiza as outras abas). Reações e
// fixadas valem para as duas pessoas; favoritas são de cada uma. Mensagens não
// vão para a auditoria, mas contam para as conquistas (src/server/achievements).

export type ChatActionResult =
  | { ok: true; conversationId?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const NOT_FOUND = { ok: false, error: "Conversa não encontrada." } as const;

async function getChatContext() {
  const session = await getSession();
  if (!session) return null;
  return { actor: session.user, meta: getRequestMeta(await headers()) };
}

/** Abre (ou cria) a conversa com a pessoa. */
export async function startConversation(input: { userId: string }): Promise<ChatActionResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = startConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pessoa inválida." };
  const { userId } = parsed.data;
  if (userId === ctx.actor.id) return { ok: false, error: "Escolha outra pessoa da equipe." };
  const [active] = await filterActiveUserIds(db, [userId]);
  if (!active) return { ok: false, error: "Essa pessoa não está ativa no Workboard." };

  const conversationId = await openConversation(db, ctx.actor.id, userId);
  return { ok: true, conversationId };
}

export async function sendChatMessage(input: SendChatMessageInput): Promise<ChatActionResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = sendChatMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise a mensagem.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { conversationId, attachmentIds } = parsed.data;
  // "/party" e companhia ficam guardados sempre do mesmo jeito.
  const body = normalizeMessageBody(parsed.data.body);
  const conversation = await findConversation(db, conversationId, ctx.actor.id);
  if (!conversation) return NOT_FOUND;
  if (!conversation.other) return { ok: false, error: "Essa pessoa não está mais no Workboard." };
  if (conversation.other.banned) return { ok: false, error: "Essa pessoa está desativada e não recebe mensagens." };

  // Anexos: arquivos que a própria pessoa enviou para a pasta "chat" e que ainda não estão em outra mensagem.
  const files = await Promise.all(attachmentIds.map((mediaId) => findMediaById(db, mediaId)));
  if (
    files.some((file) => !file || file.uploadedById !== ctx.actor.id || file.folder !== "chat") ||
    (await isChatAttachmentInUse(db, attachmentIds))
  ) {
    return { ok: false, error: "Um dos anexos é inválido. Envie de novo." };
  }

  const messageId = randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(chatMessage).values({
      id: messageId,
      conversationId,
      authorId: ctx.actor.id,
      authorName: ctx.actor.name,
      body,
      createdAt: now,
    }),
    ...(attachmentIds.length
      ? [db.insert(chatMessageAttachment).values(attachmentIds.map((mediaId) => ({ messageId, mediaId })))]
      : []),
    db.update(chatConversation).set({ lastMessageAt: now }).where(eq(chatConversation.id, conversationId)),
    // Quem responde já leu o que veio antes.
    db
      .update(chatMember)
      .set({ lastReadAt: now })
      .where(and(eq(chatMember.conversationId, conversationId), eq(chatMember.userId, ctx.actor.id))),
  ]);

  publishRealtimeAfter([conversation.other.id, ctx.actor.id], {
    type: "chat.message",
    conversationId,
    messageId,
    author: { id: ctx.actor.id, name: ctx.actor.name, imageUrl: resolveMediaUrl(ctx.actor.image) },
    preview: messagePreview(body, attachmentIds.length),
  });
  achievementsAfter("mensagem do chat", (database) =>
    onMessageSent(database, {
      kind: "chat",
      authorId: ctx.actor.id,
      body,
      attachments: attachmentIds.length,
      pastedImage: parsed.data.pastedImage,
      conversationId,
      at: now,
    }),
  );
  refresh();
  return { ok: true };
}

/** Marca a conversa como lida até agora (o "Visto" de quem mandou). */
export async function markConversationRead(input: { conversationId: string }) {
  const ctx = await getChatContext();
  if (!ctx) return null;
  const parsed = conversationTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const conversation = await findConversation(db, parsed.data.conversationId, ctx.actor.id);
  if (!conversation) return null;

  const lastReadAt = await markRead(db, conversation.id, ctx.actor.id, new Date());
  if (!lastReadAt) return null;
  publishRealtimeAfter([ctx.actor.id, ...(conversation.other ? [conversation.other.id] : [])], {
    type: "chat.read",
    conversationId: conversation.id,
    userId: ctx.actor.id,
    lastReadAt: lastReadAt.toISOString(),
  });
  return { lastReadAt: lastReadAt.toISOString() };
}

/** "Carregar mensagens anteriores": as que vieram antes de `before`. */
export async function loadOlderChatMessages(input: { conversationId: string; before: string }) {
  const ctx = await getChatContext();
  if (!ctx) return null;
  const parsed = olderChatMessagesSchema.safeParse(input);
  if (!parsed.success) return null;
  const conversation = await findConversation(db, parsed.data.conversationId, ctx.actor.id);
  if (!conversation) return null;

  const { messages, hasMore } = await listChatMessages(db, conversation.id, {
    limit: CHAT_PAGE_SIZE,
    before: new Date(parsed.data.before),
  });
  const now = new Date();
  const extras = await listMessageExtras(db, "chat", messages.map((message) => message.id), ctx.actor.id);
  return {
    messages: messages.map((message) => toChatMessageView(message, { viewerId: ctx.actor.id, now, extras })),
    hasMore,
  };
}

/** Só quem escreveu apaga (nem admins: a conversa é das duas pessoas). Os anexos saem do CDN. */
export async function deleteChatMessage(input: { messageId: string }): Promise<ChatActionResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = chatMessageTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const found = await findChatMessage(db, parsed.data.messageId);
  const conversation = found ? await findConversation(db, found.conversationId, ctx.actor.id) : null;
  if (!found || !conversation) return { ok: false, error: "Mensagem não encontrada." };
  if (found.authorId !== ctx.actor.id) return { ok: false, error: "Só quem escreveu pode excluir a mensagem." };

  const keys = await listChatAttachmentKeys(db, found.id);
  await db.delete(chatMessage).where(eq(chatMessage.id, found.id));
  // A lista de conversas ordena pela última mensagem que sobrou.
  await db
    .update(chatConversation)
    .set({
      lastMessageAt: sql`(select max(${chatMessage.createdAt}) from ${chatMessage} where ${chatMessage.conversationId} = ${conversation.id})`,
    })
    .where(eq(chatConversation.id, conversation.id));
  for (const key of keys) {
    await deleteMediaByKey(db, key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }

  publishRealtimeAfter([ctx.actor.id, ...(conversation.other ? [conversation.other.id] : [])], {
    type: "chat.deleted",
    conversationId: conversation.id,
    messageId: found.id,
  });
  achievementsAfter("mensagem apagada", (database) =>
    onMessageDeleted(database, { authorId: found.authorId, actorId: ctx.actor.id }),
  );
  refresh();
  return { ok: true };
}

/** Mensagem de uma conversa da qual quem pede faz parte (null para os outros). */
async function findMemberMessage(messageId: string, actorId: string) {
  const message = await findChatMessage(db, messageId);
  const conversation = message ? await findConversation(db, message.conversationId, actorId) : null;
  return message && conversation ? { message, conversation } : null;
}

/** Conversa só para leitura: a outra pessoa saiu ou foi desativada (dá para favoritar, não para reagir ou fixar). */
function isReadOnly(conversation: ChatConversationRecord) {
  return !conversation.other || conversation.other.banned;
}

/** Avisa as duas pessoas (e as outras abas de quem mexeu) que reações ou fixadas mudaram. */
function publishConversationUpdate(conversation: ChatConversationRecord, actorId: string) {
  publishRealtimeAfter([actorId, ...(conversation.other ? [conversation.other.id] : [])], {
    type: "chat.updated",
    conversationId: conversation.id,
  });
}

const MESSAGE_NOT_FOUND = { ok: false, error: "Mensagem não encontrada." } as const;
const READ_ONLY = { ok: false, error: "A conversa está só para leitura." } as const;

/** Liga ou desliga uma reação. Devolve as reações da mensagem como ficaram. */
export async function reactToChatMessage(input: { messageId: string; emoji: string }): Promise<MessageUpdateResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = messageReactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Reação inválida." };
  const target = await findMemberMessage(parsed.data.messageId, ctx.actor.id);
  if (!target) return MESSAGE_NOT_FOUND;
  if (isReadOnly(target.conversation)) return READ_ONLY;

  const added = await toggleReaction(db, "chat", { messageId: target.message.id, userId: ctx.actor.id, emoji: parsed.data.emoji });
  const { reactions } = await listMessageExtras(db, "chat", [target.message.id], ctx.actor.id);
  publishConversationUpdate(target.conversation, ctx.actor.id);
  if (added) {
    achievementsAfter("reação", (database) =>
      onReactionAdded(database, { kind: "chat", messageId: target.message.id, userId: ctx.actor.id }),
    );
  }
  refresh();
  return { ok: true, reactions: toReactionViews(reactions.get(target.message.id) ?? [], ctx.actor.id) };
}

/** Fixa no topo da conversa (para as duas pessoas) ou desafixa. */
export async function setChatMessagePinned(input: { messageId: string; pinned: boolean }): Promise<MessageUpdateResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = messagePinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const target = await findMemberMessage(parsed.data.messageId, ctx.actor.id);
  if (!target) return MESSAGE_NOT_FOUND;
  if (isReadOnly(target.conversation)) return READ_ONLY;
  const { pinned } = parsed.data;
  if (pinned && !target.message.pinnedAt) {
    if ((await countPinnedMessages(db, "chat", target.conversation.id)) >= PINNED_MESSAGES_MAX) {
      return { ok: false, error: `Já há ${PINNED_MESSAGES_MAX} mensagens fixadas. Desafixe uma antes.` };
    }
  }

  await setMessagePinned(db, "chat", target.message.id, pinned ? ctx.actor : null);
  publishConversationUpdate(target.conversation, ctx.actor.id);
  if (pinned && !target.message.pinnedAt) {
    achievementsAfter("mensagem fixada", (database) =>
      onMessagePinned(database, { kind: "chat", messageId: target.message.id, actorId: ctx.actor.id }),
    );
  }
  refresh();
  return { ok: true, pinned };
}

/** Guarda nas favoritas de quem pede (só ela vê), ou tira. */
export async function toggleChatFavorite(input: { messageId: string }): Promise<MessageUpdateResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = messageFavoriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const target = await findMemberMessage(parsed.data.messageId, ctx.actor.id);
  if (!target) return MESSAGE_NOT_FOUND;

  const favorite = await toggleFavorite(db, "chat", { messageId: target.message.id, userId: ctx.actor.id });
  if (favorite) achievementsAfter("favorita", (database) => onMessageFavorited(database, { userId: ctx.actor.id }));
  refresh();
  return { ok: true, favorite };
}

/** Anexo enviado e tirado do rascunho antes de mandar a mensagem: sai do CDN. */
export async function discardChatAttachment(input: { mediaId: string }): Promise<ChatActionResult> {
  const ctx = await getChatContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = z.object({ mediaId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Anexo inválido." };
  const file = await findMediaById(db, parsed.data.mediaId);
  if (!file) return { ok: true };
  if (file.uploadedById !== ctx.actor.id || file.folder !== "chat") {
    return { ok: false, error: "Você não tem permissão para esta ação." };
  }
  if (await isChatAttachmentInUse(db, [file.id])) return { ok: false, error: "Este anexo já está numa mensagem." };

  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta, audit: false });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
