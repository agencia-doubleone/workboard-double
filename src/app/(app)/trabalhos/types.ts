// Formas serializáveis que as páginas de trabalhos entregam aos client components.

import type { AttachmentView } from "@/lib/media";
import type { MessageEffect, ReactionView } from "@/lib/messages";

export type JobPersonView = { id: string; name: string; imageUrl: string | null };

export type JobStatusOption = {
  id: string;
  name: string;
  textColor: string;
  backgroundColor: string;
  isFinal: boolean;
  /** Cancela o trabalho (também encerra): só admins escolhem ou tiram. */
  isCanceled: boolean;
  isDefault: boolean;
};

export type JobRow = {
  id: string;
  pit: number;
  name: string;
  client: { name: string; slug: string; logoUrl: string | null };
  statusId: string;
  assignees: JobPersonView[];
  createdAt: { date: string; time: string; absolute: string };
  /** label: "15/10" no ano corrente (senão "15/10/25"); full: dd/mm/aaaa. Null sem entrega. */
  dueDate: { label: string; full: string } | null;
  overdue: boolean;
  active: boolean;
  hasBriefing: boolean;
  messages: { total: number; unread: number; mentioned: boolean };
};

export type JobFormValues = {
  jobId?: string;
  pit?: number;
  name: string;
  clientId: string | null;
  assigneeIds: string[];
  dueDate: string;
  statusId: string;
  active: boolean;
  briefing: string;
  /** Trabalho novo criado a partir de uma solicitação do cliente (o cliente fica travado no dela). */
  fromRequest?: { id: string; code: string; title: string; href: string };
};

export type ClientOption = { id: string; name: string; logoUrl: string | null };

export type MessageAttachmentView = AttachmentView;

/** Trecho de uma mensagem: texto ou menção já com o nome. */
export type MessagePartView = { type: "text"; text: string } | { type: "mention"; userId: string; name: string };

export type JobMessageView = {
  id: string;
  authorId: string | null;
  authorName: string;
  authorImageUrl: string | null;
  parts: MessagePartView[];
  /** Mensagem que é só um comando ("/party"): vira uma linha e um efeito na tela. */
  effect: MessageEffect | null;
  /** ISO, para comparar com a última leitura. */
  createdAt: string;
  time: { label: string; absolute: string };
  attachments: MessageAttachmentView[];
  canDelete: boolean;
  reactions: ReactionView[];
  /** Fixada no topo da conversa. */
  pinned: boolean;
  /** Nas favoritas de quem vê. */
  favorite: boolean;
};
