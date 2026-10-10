import { dayKey, formatDateTime, formatDayLabel, formatTime } from "@/lib/format";
import { excerpt } from "@/lib/notifications";
import type { ChatConversationListItem, ChatConversationRecord, ChatMessageItem, ChatPerson } from "@/server/chat";
import { resolveMediaUrl, toAttachmentView } from "@/server/media";
import type { ChatMessageView, ChatPersonView, ConversationListItemView, ConversationView } from "./types";

const DELETED_PERSON = "Pessoa excluída";

export function toChatPersonView(person: ChatPerson): ChatPersonView {
  return { id: person.id, name: person.name, imageUrl: resolveMediaUrl(person.image), active: !person.banned };
}

/** Prévia de uma mensagem: o começo do texto ou, só com anexos, quantos arquivos. */
export function messagePreview(body: string, attachments: number) {
  const text = excerpt(body, 90);
  if (text) return text;
  return attachments === 1 ? "Enviou um arquivo" : `Enviou ${attachments} arquivos`;
}

/** Hora na lista: "14:32" hoje, "ontem" ou a data. */
function listTime(date: Date, now: Date) {
  return dayKey(date) === dayKey(now) ? formatTime(date) : formatDayLabel(date, now);
}

export function toConversationListItem(
  item: ChatConversationListItem,
  ctx: { viewerId: string; now: Date },
): ConversationListItemView {
  const last = item.lastMessage;
  return {
    id: item.id,
    other: item.other && toChatPersonView(item.other),
    title: item.other?.name ?? (last && last.authorId !== ctx.viewerId ? last.authorName : DELETED_PERSON),
    lastMessage: last && {
      preview: messagePreview(last.body, last.attachments),
      mine: last.authorId === ctx.viewerId,
      time: listTime(last.createdAt, ctx.now),
    },
    unread: item.unread,
  };
}

export function toChatMessageView(message: ChatMessageItem, ctx: { viewerId: string; now: Date }): ChatMessageView {
  return {
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    mine: message.authorId === ctx.viewerId,
    text: message.body,
    createdAt: message.createdAt.toISOString(),
    time: formatTime(message.createdAt),
    absolute: formatDateTime(message.createdAt),
    day: dayKey(message.createdAt),
    dayLabel: formatDayLabel(message.createdAt, ctx.now),
    attachments: message.attachments.map(toAttachmentView),
  };
}

export function toConversationView(
  conversation: ChatConversationRecord,
  messages: ChatMessageItem[],
): ConversationView {
  const { other } = conversation;
  // Sem a outra pessoa (excluída), o nome sai das mensagens que ela deixou.
  const fromMessages = messages.find((message) => message.authorId === null)?.authorName;
  return {
    id: conversation.id,
    other: other && {
      ...toChatPersonView(other),
      lastReadAt: other.lastReadAt?.toISOString() ?? null,
    },
    title: other?.name ?? fromMessages ?? DELETED_PERSON,
    myLastReadAt: conversation.myLastReadAt?.toISOString() ?? null,
  };
}
