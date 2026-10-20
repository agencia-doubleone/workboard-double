import { isRequestOverdue, REQUEST_EDITED_FIELDS, type RequestEventData } from "@/lib/client-requests";
import { getFileExtension } from "@/lib/media";
import { formatCalendarDate, formatDate, formatDateTime, formatMessageTime } from "@/lib/format";
import type {
  ClientRequestListItem,
  ClientRequestMessageItem,
  listClientRequestEvents,
  listClientRequestStatusHistory,
} from "@/server/client-requests";
import { resolveMediaUrl, toAttachmentView } from "@/server/media";
import type { RequestDeliveryItem } from "@/server/request-deliveries";
import type { DeliveryView, RequestMessageView, RequestRowView, RequestTimelineItemView } from "./types";

// Linhas do banco → tipos de view das solicitações (só no servidor). Usado pela
// tela da equipe e pela do portal: o que sai daqui o cliente pode ver.

/** "15/10" na tabela; a data completa na dica. */
function shortDate(value: string) {
  const full = formatCalendarDate(value);
  return { label: full.slice(0, 5), full };
}

/** `today`: o dia de hoje em Brasília (todayInSaoPaulo), para saber o que está atrasado. */
export function toRequestRow(item: ClientRequestListItem, today: string): RequestRowView {
  return {
    id: item.id,
    number: item.number,
    title: item.title,
    status: item.status,
    expectedOn: item.expectedOn ? shortDate(item.expectedOn) : null,
    overdue: isRequestOverdue(item.expectedOn, item.status, today),
    hasBriefing: item.hasBriefing,
    pendingDelivery: item.pendingDelivery,
    createdAt: { date: formatDate(item.createdAt), absolute: formatDateTime(item.createdAt) },
    createdByName: item.createdByName,
    createdBySide: item.createdBySide,
    client: { name: item.client.name, slug: item.client.slug, logoUrl: resolveMediaUrl(item.client.logoKey) },
    messages: { total: item.messageTotal, unread: item.messageUnread },
    isNew: item.isNew,
  };
}

/**
 * Quem vê: alguém da equipe (admin: apaga qualquer mensagem) ou um contato do
 * portal (apaga só as próprias).
 */
export type MessageViewer = { kind: "team"; userId: string } | { kind: "portal"; portalUserId: string };

export function toRequestMessageView(message: ClientRequestMessageItem, viewer: MessageViewer, now: Date): RequestMessageView {
  const mine = viewer.kind === "team" ? message.authorId === viewer.userId : message.authorPortalUserId === viewer.portalUserId;
  return {
    id: message.id,
    authorName: message.authorName,
    authorImageUrl: resolveMediaUrl(message.authorImage),
    side: message.authorSide,
    mine,
    body: message.body,
    attachments: message.attachments.map(toAttachmentView),
    createdAt: message.createdAt.toISOString(),
    time: { label: formatMessageTime(message.createdAt, now), absolute: formatDateTime(message.createdAt) },
    // A equipe (só admins veem a solicitação) apaga qualquer uma; o contato, só as dele.
    canDelete: viewer.kind === "team" || mine,
  };
}

type StatusHistoryRow = Awaited<ReturnType<typeof listClientRequestStatusHistory>>[number];
type EventRow = Awaited<ReturnType<typeof listClientRequestEvents>>[number];

/** O andamento inteiro (trocas de status + previsão e edições), do mais recente para o mais antigo. */
export function toRequestTimeline(history: StatusHistoryRow[], events: EventRow[]): RequestTimelineItemView[] {
  const items = [
    ...history.map((row) => ({
      date: row.changedAt,
      view: {
        id: row.id,
        by: row.changedByName,
        side: row.changedBySide,
        at: formatDateTime(row.changedAt),
        kind: "status",
        status: row.status,
      } satisfies RequestTimelineItemView,
    })),
    ...events.map((row) => ({ date: row.createdAt, view: toEventView(row) })),
  ];
  // No mesmo instante (cadastrar já com previsão), a troca de status fica por baixo: veio antes.
  const rank = (item: (typeof items)[number]) => (item.view.kind === "status" ? 1 : 0);
  return items.sort((a, b) => b.date.getTime() - a.date.getTime() || rank(a) - rank(b)).map((item) => item.view);
}

function toEventView(row: EventRow): RequestTimelineItemView {
  const base = { id: row.id, by: row.actorName, side: row.actorSide, at: formatDateTime(row.createdAt) };
  if (row.type === "expected_on") {
    const { from, to } = row.data as RequestEventData["expected_on"];
    const format = (value: string | null) => (value ? formatCalendarDate(value) : null);
    return { ...base, kind: "expected_on", from: format(from), to: format(to) };
  }
  if (row.type === "delivery_sent") {
    const { round, files } = row.data as RequestEventData["delivery_sent"];
    return { ...base, kind: "delivery_sent", round, files };
  }
  if (row.type === "delivery_answered") {
    const { round, approved, changes } = row.data as RequestEventData["delivery_answered"];
    return { ...base, kind: "delivery_answered", round, approved, changes };
  }
  const { fields } = row.data as RequestEventData["edited"];
  return { ...base, kind: "edited", fields: fields.map((field) => REQUEST_EDITED_FIELDS[field] ?? field) };
}

/** Vídeos que o navegador toca na prévia; os outros (mov, avi...) abrem pelo link. */
const PLAYABLE_VIDEO = /^video\/(mp4|webm|ogg)$/;

/**
 * Rodada → view, para a equipe ou o portal. O portal vê as respostas ainda em
 * rascunho (os contatos do cliente respondem juntos); a equipe só vê depois
 * que o cliente envia as respostas. Quando e quem tirou os arquivos do
 * servidor é só da equipe.
 */
export function toDeliveryView(row: RequestDeliveryItem, { side }: { side: "team" | "portal" }): DeliveryView {
  const visible = side === "portal" || row.status !== "pending";
  return {
    id: row.id,
    round: row.round,
    status: row.status,
    note: row.note,
    sentBy: row.sentByName,
    sentAt: formatDateTime(row.sentAt),
    answeredBy: row.answeredByName,
    answeredAt: row.answeredAt ? formatDateTime(row.answeredAt) : null,
    filesRemoved:
      side === "team" && row.filesRemovedAt ? { at: formatDateTime(row.filesRemovedAt), by: row.filesRemovedByName } : null,
    files: row.files.map((item) => {
      const attachment = item.media ? toAttachmentView(item.media) : null;
      return {
        id: item.id,
        name: item.name,
        file:
          attachment && item.media
            ? {
                ...attachment,
                preview: attachment.isImage ? "image" : PLAYABLE_VIDEO.test(item.media.type) ? "video" : null,
                extension: getFileExtension(item.media.name).toUpperCase(),
              }
            : null,
        decision: visible ? item.decision : null,
        comment: visible ? item.comment : null,
        decidedBy: visible ? item.decidedByName : null,
      };
    }),
  };
}
