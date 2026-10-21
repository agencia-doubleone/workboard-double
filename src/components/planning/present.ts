import { formatCompactDay, formatMonth } from "@/lib/calendar";
import { instagramHandle } from "@/lib/clients";
import { formatDate } from "@/lib/format";
import { artMediaKind, captionChanged } from "@/lib/planning";
import { getMediaUrl, resolveMediaUrl } from "@/server/media";
import type { PlanningPostRecord } from "@/server/planning";
import type { PostArtRow } from "@/server/planning-approvals";
import type { ClientMonthPost } from "@/server/planning-sends";
import type {
  PlanningAnswerView,
  PlanningArtView,
  PlanningPastPostView,
  PlanningPostView,
  PlanningProfileView,
  PortalPostStateView,
} from "./types";

// Linhas do banco → tipos de view do planejamento como o cliente vê (só no
// servidor). Usado pela prévia da equipe e, depois, pelo portal: o que sai
// daqui o cliente pode ver (nada de observações, status ou responsáveis).

function toArtView(rows: PostArtRow[]): PlanningArtView[] {
  // Arte que saiu do CDN (versão antiga limpa) ou que não serve mais fica fora.
  return rows.flatMap((row) => {
    const kind = row.media ? artMediaKind(row.media.name) : null;
    return row.media && row.mediaId && kind ? [{ id: row.id, url: getMediaUrl(row.media.key), name: row.name, kind, role: row.role }] : [];
  });
}

/** `stage`: a etapa que o cliente vê; sem ela, a arte quando o post tem arte, senão a pauta (a prévia da equipe). */
export function toPlanningPostView(post: PlanningPostRecord, art: PostArtRow[], stage?: "pauta" | "arte"): PlanningPostView {
  const caption = { copy: post.copy, cta: post.cta, hashtags: post.hashtags };
  const artView = toArtView(art);
  const shown = stage ?? (artView.some((item) => item.role === "art") ? "arte" : "pauta");
  return {
    id: post.id,
    date: post.date,
    dateLabel: post.date ? formatCompactDay(post.date) : null,
    network: post.network,
    kind: post.kind,
    stage: shown,
    headline: post.headline,
    supportText: post.supportText,
    slides: post.slides,
    scenes: post.scenes,
    ...caption,
    art: shown === "arte" ? artView : [],
    briefCaption: post.briefCaption && captionChanged(post.briefCaption, caption) ? post.briefCaption : null,
  };
}

export function toPlanningPastPostView(post: PlanningPostRecord, month: string, art: PostArtRow[]): PlanningPastPostView {
  return { ...toPlanningPostView(post, art, "arte"), monthLabel: formatMonth(month) };
}

export function toPlanningProfile(client: { name: string; logoKey: string | null; instagram: string | null }): PlanningProfileView {
  return { name: client.name, logoUrl: resolveMediaUrl(client.logoKey), instagramHandle: instagramHandle(client.instagram) };
}

type ReviewRow = { decision: "approved" | "changes"; comment: string | null; name: string; side: "team" | "client"; submittedAt: Date | null; createdAt: Date };

function toAnswer(review: ReviewRow): PlanningAnswerView {
  return {
    decision: review.decision,
    comment: review.comment,
    byName: review.name,
    byTeam: review.side === "team",
    dateLabel: formatDate(review.submittedAt ?? review.createdAt),
  };
}

/** A situação de um post do mês no portal (loadClientMonth): o que espera resposta, o rascunho e as respostas enviadas. */
export function toPortalPostState(row: ClientMonthPost): PortalPostStateView {
  return {
    sendPostId: row.pendingSendPostId,
    draft: row.draft ? { decision: row.draft.decision, comment: row.draft.comment, byName: row.draft.name } : null,
    last: row.lastAnswer ? toAnswer(row.lastAnswer) : null,
    history: row.history.map(toAnswer),
  };
}
