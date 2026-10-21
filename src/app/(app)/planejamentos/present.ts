import { formatCompactDay } from "@/lib/calendar";
import { formatDate, formatDateTime } from "@/lib/format";
import { APPROVAL_STAGES, SOCIAL_NETWORKS, type ApprovalStage, type PlanningPostEventData } from "@/lib/planning";
import type { listPendingSends, listPostHistory } from "@/server/planning-sends";
import type { PendingSendView, PostHistoryItem, PostView } from "./types";

// Linhas do banco → tipos de view da tela de planejamentos da equipe (só no servidor).

type History = Awaited<ReturnType<typeof listPostHistory>>;

const stageName = (stage: ApprovalStage) => APPROVAL_STAGES[stage].toLowerCase();
const day = (value: string | null) => (value ? formatCompactDay(value) : "sem data");

function eventText(data: PlanningPostEventData, actor: string) {
  switch (data.type) {
    case "sent":
      return `${actor} enviou a ${stageName(data.stage)} ao cliente`;
    case "withdrawn":
      return `${actor} retirou o post do envio da ${stageName(data.stage)}`;
    case "approval_kept":
      return `${actor} editou depois de aprovado, sem tirar a aprovação (${data.stages.map(stageName).join(" e ")})`;
    case "approval_removed":
      return `${actor} editou depois de aprovado: a aprovação (${data.stages.map(stageName).join(" e ")}) saiu`;
    case "brief_approval_undone":
      return `${actor} desfez a aprovação da pauta`;
    case "date_changed":
      return `${actor} mudou a data de ${day(data.from)} para ${day(data.to)}`;
    case "network_changed":
      return `${actor} mudou a rede de ${data.from ? SOCIAL_NETWORKS[data.from] : "nenhuma"} para ${data.to ? SOCIAL_NETWORKS[data.to] : "nenhuma"}`;
  }
}

/** O histórico de cada post: respostas (do cliente ou registradas pela equipe) e acontecimentos, por data. */
export function toPostHistories(history: History) {
  const map = new Map<string, (PostHistoryItem & { at: Date })[]>();
  const add = (postId: string, item: PostHistoryItem & { at: Date }) => map.set(postId, [...(map.get(postId) ?? []), item]);
  for (const review of history.reviews) {
    const by = review.side === "team" ? `${review.name} (pela equipe, em nome do cliente)` : review.name;
    const what = review.decision === "approved" ? `aprovou a ${stageName(review.stage)}` : `pediu alteração na ${stageName(review.stage)}`;
    const at = review.submittedAt ?? review.createdAt;
    add(review.postId, { id: review.id, text: `${by} ${what}`, comment: review.comment, dateLabel: formatDateTime(at), at });
  }
  for (const event of history.events) {
    add(event.postId, {
      id: event.id,
      text: eventText(event.data, event.actorName ?? "Alguém"),
      comment: null,
      dateLabel: formatDateTime(event.createdAt),
      at: event.createdAt,
    });
  }
  for (const items of map.values()) items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return map;
}

/** A alteração pedida mais recente da etapa em que o post está (para o destaque no card). */
export function changesRequestOf(
  post: { briefState: string; artState: string },
  reviews: History["reviews"],
): PostView["changesRequest"] {
  const stage: ApprovalStage | null = post.artState === "alteracoes" ? "arte" : post.briefState === "alteracoes" ? "pauta" : null;
  if (!stage) return null;
  const last = [...reviews].reverse().find((review) => review.stage === stage && review.decision === "changes" && review.comment);
  return last ? { stage, comment: last.comment!, byName: last.name, dateLabel: formatDate(last.submittedAt ?? last.createdAt) } : null;
}

export function toPendingSendView(send: Awaited<ReturnType<typeof listPendingSends>>[number]): PendingSendView {
  return {
    id: send.id,
    stage: send.stage,
    sentByName: send.sentByName,
    sentAtLabel: formatDate(send.sentAt),
    total: send.total,
    waiting: send.waiting,
    answered: send.answered,
  };
}
