// Formas serializáveis que as páginas do chat entregam aos client components.

import type { AttachmentView } from "@/lib/media";

export type ChatPersonView = {
  id: string;
  name: string;
  imageUrl: string | null;
  /** Desativada: a conversa fica para leitura. */
  active: boolean;
};

export type ConversationListItemView = {
  id: string;
  /** null: a outra pessoa foi excluída. */
  other: ChatPersonView | null;
  /** Nome para mostrar mesmo sem a outra pessoa (vem das mensagens dela). */
  title: string;
  lastMessage: { preview: string; mine: boolean; time: string } | null;
  unread: number;
};

export type ChatMessageView = {
  id: string;
  authorId: string | null;
  authorName: string;
  mine: boolean;
  text: string;
  /** ISO: ordem, cursor de "anteriores" e comparação com as leituras. */
  createdAt: string;
  time: string;
  absolute: string;
  /** "AAAA-MM-DD" no fuso da agência e o rótulo do dia ("hoje", "ontem", "08/10"). */
  day: string;
  dayLabel: string;
  attachments: AttachmentView[];
};

export type ConversationView = {
  id: string;
  other: (ChatPersonView & { lastReadAt: string | null }) | null;
  title: string;
  myLastReadAt: string | null;
};
