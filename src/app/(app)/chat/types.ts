// Formas serializáveis que as páginas do chat entregam aos client components.

import type { AttachmentView } from "@/lib/media";
import type { MessageEffect, ReactionView } from "@/lib/messages";

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
  /** Mensagem que é só um comando ("/party"): vira uma linha e um efeito na tela. */
  effect: MessageEffect | null;
  /** ISO: ordem, cursor de "anteriores" e comparação com as leituras. */
  createdAt: string;
  time: string;
  absolute: string;
  /** "AAAA-MM-DD" no fuso da agência e o rótulo do dia ("hoje", "ontem", "08/10"). */
  day: string;
  dayLabel: string;
  attachments: AttachmentView[];
  reactions: ReactionView[];
  /** Fixada no topo da conversa. */
  pinned: boolean;
  /** Nas favoritas de quem vê. */
  favorite: boolean;
};

/** Uma mensagem nas favoritas (do chat ou de um trabalho), com de onde veio. */
export type FavoriteMessageView = {
  id: string;
  kind: "job" | "chat";
  /** "#12 Site novo" ou "Conversa com Ana", e o link para lá. */
  source: { label: string; href: string };
  authorName: string;
  authorImageUrl: string | null;
  /** Texto pronto (menções já como "@Nome"). */
  text: string;
  effect: MessageEffect | null;
  attachments: AttachmentView[];
  /** "08/10/2026 14:32" */
  time: string;
};

export type ConversationView = {
  id: string;
  other: (ChatPersonView & { lastReadAt: string | null }) | null;
  title: string;
  myLastReadAt: string | null;
};
