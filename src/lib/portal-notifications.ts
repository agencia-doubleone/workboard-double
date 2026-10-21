// Notificações do portal do cliente (o sino do header do portal): tipos, o que
// fica guardado e o texto de cada uma. Compartilhado entre servidor e navegador.
// Quem recebe são os contatos ativos do cliente; quem faz é sempre alguém da
// Double One (as ações do próprio contato não avisam ninguém do portal).

import { formatMonth } from "@/lib/calendar";
import { REQUEST_STATUSES, requestCode, type RequestStatus } from "@/lib/client-requests";
import { formatCalendarDate } from "@/lib/format";
import { PORTAL_PLANNING_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";

export const PORTAL_NOTIFICATION_TYPES = [
  /** A equipe abriu uma solicitação em nome do cliente. */
  "request.created",
  /** Rodada nova para aprovar. */
  "request.delivery",
  /** Mensagem da equipe (somam numa notificação só enquanto não lida). */
  "request.message",
  "request.status",
  "request.expected_on",
  /** Pauta do planejamento para aprovar (o texto dos posts). */
  "planning.brief",
  /** Artes do planejamento para aprovar. */
  "planning.art",
] as const;
export type PortalNotificationType = (typeof PORTAL_NOTIFICATION_TYPES)[number];

/** Copiado no momento: das solicitações (request.*) ou do planejamento (planning.*). */
export type PortalNotificationData = {
  requestNumber?: number;
  requestTitle?: string;
  /** request.delivery */
  round?: number;
  files?: number;
  /** request.status */
  status?: RequestStatus;
  /** request.expected_on: "AAAA-MM-DD" ou null (previsão retirada). */
  expectedOn?: string | null;
  /** request.message: trecho da última mensagem. */
  excerpt?: string;
  /** planning.*: o mês, "AAAA-MM", e quantos posts foram. */
  month?: string;
  posts?: number;
};

export const PORTAL_NOTIFICATIONS_PAGE_SIZE = 20;
/** O sino do portal não tem tempo real: reconta a cada tanto com a aba visível (e ao voltar para ela). */
export const PORTAL_NOTIFICATIONS_POLL_MS = 30_000;

/** Título e texto de cada notificação do portal (quem fez já vem com " (Double One)" na tela). */
export function portalNotificationText(item: { type: PortalNotificationType; data: PortalNotificationData; count: number }) {
  const { data } = item;
  const code = data.requestNumber ? requestCode(data.requestNumber) : "Solicitação";
  const request = `${code} ${data.requestTitle ?? ""}`.trim();
  const month = data.month ? formatMonth(data.month) : "o mês";
  const posts = data.posts === 1 ? "1 post" : `${data.posts ?? 0} posts`;
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
        title: item.count > 1 ? `${item.count} mensagens novas em ${code}` : `Mensagem em ${code}`,
        body: data.excerpt ?? request,
      };
    case "request.status":
      return {
        title: `${code} agora está em "${data.status ? REQUEST_STATUSES[data.status].label : "outro status"}"`,
        body: data.requestTitle ?? "",
      };
    case "request.expected_on":
      return {
        title: data.expectedOn
          ? `Previsão de entrega: ${formatCalendarDate(data.expectedOn)}`
          : "Previsão de entrega retirada",
        body: request,
      };
    case "planning.brief":
      return { title: `Pauta de ${month} para aprovar`, body: `${posts} esperando sua resposta: o texto antes das artes.` };
    case "planning.art":
      return { title: `Artes de ${month} para aprovar`, body: `${posts} esperando sua resposta.` };
  }
}

/** Para onde a notificação leva no portal. */
export function portalNotificationHref(item: { type: PortalNotificationType; data: PortalNotificationData }) {
  if (item.type === "planning.brief" || item.type === "planning.art") {
    return item.data.month ? `${PORTAL_PLANNING_PATH}?mes=${item.data.month}` : PORTAL_PLANNING_PATH;
  }
  const page = `${PORTAL_REQUESTS_PATH}/${item.data.requestNumber}`;
  if (item.type === "request.delivery") return `${page}#entregas`;
  if (item.type === "request.message") return `${page}#mensagens`;
  return page;
}
