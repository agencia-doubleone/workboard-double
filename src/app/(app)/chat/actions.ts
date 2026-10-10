"use server";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { chatConversation, chatMember, chatMessage, chatMessageAttachment } from "@/db/schema";
import { CHAT_PAGE_SIZE } from "@/lib/chat";
import { getSession } from "@/lib/session";
import {
  chatMessageTargetSchema,
  conversationTargetSchema,
  olderChatMessagesSchema,
  sendChatMessageSchema,
  startConversationSchema,
  type SendChatMessageInput,
} from "@/lib/validations/chat";
import { getRequestMeta } from "@/server/audit";
import {
  findChatMessage,
  findConversation,
  isChatAttachmentInUse,
  listChatAttachmentKeys,
  listChatMessages,
  markConversationRead as markRead,
  openConversation,
} from "@/server/chat";
import { filterActiveUserIds } from "@/server/jobs";
import { deleteMedia, deleteMediaByKey, findMediaById, resolveMediaUrl } from "@/server/media";
import { publishRealtimeAfter } from "@/server/realtime";
import { messagePreview, toChatMessageView } from "./present";

// Chat 1:1. Só quem está na conversa lê, escreve e marca como lida; nem admins
// veem as conversas dos outros. Cada mensagem avisa as duas pessoas em tempo
// real (a outra recebe o aviso; a própria atualiza as outras abas). Mensagens
// não vão para a auditoria.

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
  const { conversationId, body, attachmentIds } = parsed.data;
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
  return { messages: messages.map((message) => toChatMessageView(message, { viewerId: ctx.actor.id, now })), hasMore };
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
  refresh();
  return { ok: true };
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
