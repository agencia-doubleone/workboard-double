import type { DeliveryDecision, DeliveryStatus, RequestSide, RequestStatus } from "@/lib/client-requests";
import type { AttachmentView } from "@/lib/media";

// Tipos de view das solicitações, iguais para a tela da equipe e a do portal.
// Nada de dado interno da agência aqui: tudo o que vai nestes tipos o cliente pode ver.

/** Uma linha das listas de solicitações. */
export type RequestRowView = {
  id: string;
  number: number;
  title: string;
  status: RequestStatus;
  /** Previsão de entrega: "15/10" e a data completa; null sem previsão. */
  expectedOn: { label: string; full: string } | null;
  /** Passou da previsão sem encerrar: a data fica em vermelho (equipe e portal). */
  overdue: boolean;
  /** Tem briefing (o botão do modal fica apagado sem). */
  hasBriefing: boolean;
  /** Uma rodada espera a resposta do cliente. */
  pendingDelivery: boolean;
  createdAt: { date: string; absolute: string };
  createdByName: string;
  /** Quem abriu: o cliente, pelo portal, ou a equipe, em nome dele. */
  createdBySide: RequestSide;
  client: { name: string; slug: string; logoUrl: string | null };
  messages: { total: number; unread: number };
  /** Equipe: chegou depois do último "visto" de quem vê (nunca aberta). */
  isNew: boolean;
};

/** Uma mensagem da conversa da solicitação. */
export type RequestMessageView = {
  id: string;
  authorName: string;
  authorImageUrl: string | null;
  /** De que lado veio: a agência ("team") ou o cliente ("client"). */
  side: RequestSide;
  /** Escrita por quem está vendo. */
  mine: boolean;
  body: string;
  attachments: AttachmentView[];
  /** ISO, para a linha de "novas mensagens". */
  createdAt: string;
  time: { label: string; absolute: string };
  canDelete: boolean;
};

/**
 * Um registro do andamento, do mais recente para o mais antigo: troca de
 * status, previsão de entrega (datas já formatadas; null = sem previsão) ou
 * edição (os campos, em minúsculas: "assunto", "briefing").
 */
export type RequestTimelineItemView = {
  id: string;
  /** Quem fez (null se não ficou registrado) e de que lado. */
  by: string | null;
  side: RequestSide;
  at: string;
} & (
  | { kind: "status"; status: RequestStatus }
  | { kind: "expected_on"; from: string | null; to: string | null }
  | { kind: "edited"; fields: string[] }
  | { kind: "delivery_sent"; round: number; files: number }
  | { kind: "delivery_answered"; round: number; approved: number; changes: number }
);

/** Um arquivo de uma rodada para aprovação, com a resposta do cliente. */
export type DeliveryFileView = {
  id: string;
  /** O nome, mesmo depois de o arquivo sair do servidor. */
  name: string;
  /** null: o arquivo já foi excluído do servidor (a resposta do cliente continua). */
  file:
    | (AttachmentView & {
        /** Prévia no navegador: imagem, vídeo que toca (mp4/webm) ou nenhuma (ícone com a extensão). */
        preview: "image" | "video" | null;
        extension: string;
      })
    | null;
  /** Na tela da equipe, só aparece depois que o cliente envia as respostas. */
  decision: DeliveryDecision | null;
  comment: string | null;
  decidedBy: string | null;
};

/** Uma rodada de entrega para aprovação. */
export type DeliveryView = {
  id: string;
  round: number;
  status: DeliveryStatus;
  /** Recado da equipe (HTML limpo; "" sem recado). */
  note: string;
  sentBy: string;
  sentAt: string;
  answeredBy: string | null;
  answeredAt: string | null;
  /** Só na equipe: os arquivos saíram do servidor (depois de uma rodada mais nova aprovada). */
  filesRemoved: { at: string; by: string | null } | null;
  files: DeliveryFileView[];
};

/** Server Actions das respostas do cliente (só no portal). */
export type DeliveryAnswerActions = {
  decide: (input: {
    fileId: string;
    decision: DeliveryDecision | null;
    comment?: string;
  }) => Promise<{ ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }>;
  submit: (input: { deliveryId: string }) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
};

/** Server Actions da conversa, de cada lado (equipe ou portal). */
export type RequestConversationActions = {
  send: (input: {
    requestId: string;
    body: string;
    attachmentIds: string[];
  }) => Promise<{ ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }>;
  remove: (input: { messageId: string }) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  discard: (input: { mediaId: string }) => Promise<unknown>;
  markRead: (input: { requestId: string }) => Promise<unknown>;
};
