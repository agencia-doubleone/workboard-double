// Notificações do sino: tipos, o que fica guardado e o texto de cada uma.
// Compartilhado entre servidor e navegador (sem banco).

import { formatMonth } from "@/lib/calendar";
import { deliveryAnswerSummary } from "@/lib/client-requests";
import { PLANNING_STATUSES, type PlanningStatus } from "@/lib/planning";

export const NOTIFICATION_TYPES = [
  "job.assigned",
  "job.unassigned",
  "job.status_changed",
  "job.message",
  "job.mention",
  "planning.assigned",
  "planning.month_status",
  "planning.post_status",
  "whiteboard.shared",
  "request.created",
  "request.message",
  "request.canceled",
  "request.delivery_answered",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationStatus = { name: string; textColor: string; backgroundColor: string };

/** Copiado no momento do evento: o trabalho e o status podem mudar de nome depois. */
export type NotificationData = {
  pit?: number;
  jobName?: string;
  /** Novo status (job.status_changed). */
  status?: NotificationStatus;
  /** Trecho da última mensagem, com as menções já como "@Nome" (job.message e job.mention). */
  excerpt?: string;
  // Planejamentos (planning.*)
  clientName?: string;
  clientSlug?: string;
  /** "AAAA-MM" (ausente em planning.assigned: leva ao mês atual). */
  month?: string;
  planningStatus?: PlanningStatus;
  /** Headline do post (planning.post_status). */
  headline?: string;
  /** Dia do post, "AAAA-MM-DD". */
  postDate?: string;
  // Quadros brancos (whiteboard.*)
  boardId?: string;
  boardTitle?: string;
  // Solicitações do portal do cliente (request.*), com clientName.
  requestNumber?: number;
  requestTitle?: string;
  /** Entrega respondida pelo cliente (request.delivery_answered). */
  round?: number;
  approved?: number;
  changes?: number;
};

/** Quantas aparecem no sino de uma vez (o resto vem em "Carregar mais"). */
export const NOTIFICATIONS_PAGE_SIZE = 20;
const EXCERPT_MAX_LENGTH = 140;

/** Texto corrido e curto para avisos: espaços e quebras viram um espaço só. */
export function excerpt(text: string, max = EXCERPT_MAX_LENGTH) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

type NotificationLike = {
  type: NotificationType;
  actorName: string | null;
  data: NotificationData;
  count: number;
};

function jobLabel(data: NotificationData) {
  return data.pit ? `#${data.pit} ${data.jobName ?? ""}`.trim() : "um trabalho";
}

/** Texto simples, para o aviso na tela e a notificação do sistema. */
export function notificationText(item: NotificationLike): { title: string; body: string } {
  const actor = item.actorName ?? "Alguém";
  const { data } = item;
  const pit = data.pit ? `#${data.pit}` : "um trabalho";
  switch (item.type) {
    case "job.assigned":
      return { title: "Novo trabalho para você", body: `${actor} incluiu você em ${jobLabel(data)}.` };
    case "job.unassigned":
      return { title: "Você saiu de um trabalho", body: `${actor} tirou você de ${jobLabel(data)}.` };
    case "job.status_changed":
      return {
        title: `${pit}: ${data.status?.name ?? "status alterado"}`,
        body: `${actor} mudou o status de ${jobLabel(data)}.`,
      };
    case "job.message":
      return {
        title: item.count > 1 ? `${item.count} mensagens novas em ${pit}` : `${actor} em ${pit}`,
        body: data.excerpt ?? "",
      };
    case "job.mention":
      return { title: `${actor} mencionou você em ${pit}`, body: data.excerpt ?? "" };
    case "planning.assigned":
      return {
        title: "Novo planejamento para você",
        body: `${actor} incluiu você como responsável pelo planejamento de ${data.clientName ?? "um cliente"}.`,
      };
    case "planning.month_status": {
      const month = data.month ? formatMonth(data.month) : "o mês";
      const status = data.planningStatus ? PLANNING_STATUSES[data.planningStatus].label : "outro status";
      return {
        title: `${data.clientName ?? "Planejamento"}: ${status}`,
        body: `${actor} mudou o planejamento de ${month} para "${status}".`,
      };
    }
    case "planning.post_status": {
      const status = data.planningStatus ? PLANNING_STATUSES[data.planningStatus].label : "outro status";
      const day = data.postDate ? ` de ${data.postDate.slice(8)}/${data.postDate.slice(5, 7)}` : "";
      return {
        title: `${data.clientName ?? "Planejamento"}: post ${status.toLowerCase()}`,
        body: `${actor} mudou o post${day} para "${status}"${data.headline ? `: ${excerpt(data.headline, 80)}` : "."}`,
      };
    }
    case "whiteboard.shared":
      return {
        title: "Novo quadro para você",
        body: `${actor} incluiu você no quadro "${data.boardTitle ?? "sem nome"}".`,
      };
    case "request.created":
      return {
        title: `Nova solicitação de ${data.clientName ?? "um cliente"}`,
        body: `${actor} abriu ${requestLabel(data)}.`,
      };
    case "request.message": {
      const code = data.requestNumber ? `S-${data.requestNumber}` : "uma solicitação";
      return {
        title: item.count > 1 ? `${item.count} mensagens novas em ${code}` : `${actor} em ${code}`,
        body: data.excerpt ?? "",
      };
    }
    case "request.canceled":
      return {
        title: `${data.clientName ?? "O cliente"} cancelou uma solicitação`,
        body: `${actor} cancelou ${requestLabel(data)}.`,
      };
    case "request.delivery_answered":
      return {
        title: `${data.clientName ?? "O cliente"} respondeu a rodada ${data.round ?? ""}`.trim(),
        body: `${actor} respondeu ${requestLabel(data)}: ${deliveryAnswerSummary(data.approved ?? 0, data.changes ?? 0)}.`,
      };
  }
}

function requestLabel(data: NotificationData) {
  return data.requestNumber ? `S-${data.requestNumber} ${data.requestTitle ?? ""}`.trim() : "uma solicitação";
}

/** Para onde a notificação leva. Quem saiu do trabalho não tem mais acesso a ele. */
export function notificationHref(item: { type: NotificationType; data: NotificationData }) {
  if (item.type === "whiteboard.shared") return item.data.boardId ? `/quadros/${item.data.boardId}` : null;
  if (
    item.type === "request.created" ||
    item.type === "request.message" ||
    item.type === "request.canceled" ||
    item.type === "request.delivery_answered"
  ) {
    if (!item.data.requestNumber) return null;
    const page = `/solicitacoes/${item.data.requestNumber}`;
    if (item.type === "request.message") return `${page}#mensagens`;
    return item.type === "request.delivery_answered" ? `${page}#entregas` : page;
  }
  if (item.type === "planning.assigned" || item.type === "planning.month_status" || item.type === "planning.post_status") {
    if (!item.data.clientSlug) return null;
    return `/planejamentos/${item.data.clientSlug}${item.data.month ? `?mes=${item.data.month}` : ""}`;
  }
  if (item.type === "job.unassigned" || !item.data.pit) return null;
  const page = `/trabalhos/${item.data.pit}`;
  return item.type === "job.message" || item.type === "job.mention" ? `${page}#mensagens` : page;
}
