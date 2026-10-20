// Notificações do portal do cliente (o sino do header do portal): tipos, o que
// fica guardado e o texto de cada uma. Compartilhado entre servidor e navegador.
// Quem recebe são os contatos ativos do cliente; quem faz é sempre alguém da
// Double One (as ações do próprio contato não avisam ninguém do portal).

import { REQUEST_STATUSES, requestCode, type RequestStatus } from "@/lib/client-requests";
import { formatCalendarDate } from "@/lib/format";
import { PORTAL_REQUESTS_PATH } from "@/lib/portal";

export const PORTAL_NOTIFICATION_TYPES = [
  /** A equipe abriu uma solicitação em nome do cliente. */
  "request.created",
  /** Rodada nova para aprovar. */
  "request.delivery",
  /** Mensagem da equipe (somam numa notificação só enquanto não lida). */
  "request.message",
  "request.status",
  "request.expected_on",
] as const;
export type PortalNotificationType = (typeof PORTAL_NOTIFICATION_TYPES)[number];

export type PortalNotificationData = {
  requestNumber: number;
  requestTitle: string;
  /** request.delivery */
  round?: number;
  files?: number;
  /** request.status */
  status?: RequestStatus;
  /** request.expected_on: "AAAA-MM-DD" ou null (previsão retirada). */
  expectedOn?: string | null;
  /** request.message: trecho da última mensagem. */
  excerpt?: string;
};

export const PORTAL_NOTIFICATIONS_PAGE_SIZE = 20;
/** O sino do portal não tem tempo real: reconta a cada tanto com a aba visível (e ao voltar para ela). */
export const PORTAL_NOTIFICATIONS_POLL_MS = 30_000;

/** Título e texto de cada notificação do portal (quem fez já vem com " (Double One)" na tela). */
export function portalNotificationText(item: { type: PortalNotificationType; data: PortalNotificationData; count: number }) {
  const { data } = item;
  const request = `${requestCode(data.requestNumber)} ${data.requestTitle}`;
  switch (item.type) {
    case "request.created":
      return { title: "Nova solicitação aberta pela Double One", body: request };
    case "request.delivery":
      return {
        title: data.round ? `Rodada ${data.round} para aprovar` : "Entrega para aprovar",
        body: `${request}: ${data.files === 1 ? "1 arquivo" : `${data.files ?? 0} arquivos`} esperando sua resposta.`,
      };
    case "request.message":
      return {
        title: item.count > 1 ? `${item.count} mensagens novas em ${requestCode(data.requestNumber)}` : `Mensagem em ${requestCode(data.requestNumber)}`,
        body: data.excerpt ?? request,
      };
    case "request.status":
      return {
        title: `${requestCode(data.requestNumber)} agora está em "${data.status ? REQUEST_STATUSES[data.status].label : "outro status"}"`,
        body: data.requestTitle,
      };
    case "request.expected_on":
      return {
        title: data.expectedOn
          ? `Previsão de entrega: ${formatCalendarDate(data.expectedOn)}`
          : "Previsão de entrega retirada",
        body: request,
      };
  }
}

/** Para onde a notificação leva no portal. */
export function portalNotificationHref(item: { type: PortalNotificationType; data: PortalNotificationData }) {
  const page = `${PORTAL_REQUESTS_PATH}/${item.data.requestNumber}`;
  if (item.type === "request.delivery") return `${page}#entregas`;
  if (item.type === "request.message") return `${page}#mensagens`;
  return page;
}
