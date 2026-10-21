import type { ArtMediaKind, ArtRole, BriefCaption, PostKind, PostScene, PostSlide, SocialNetwork } from "@/lib/planning";

// Tipos de view do planejamento como o cliente vê (apresentação, feed e lista),
// iguais na prévia da equipe e no portal. Nada de dado interno da agência aqui
// (observações, status, responsáveis): tudo o que vai nestes tipos o cliente pode ver.

/** Uma arte (imagem ou vídeo no CDN). */
export type PlanningArtView = { id: string; url: string; name: string; kind: ArtMediaKind; role: ArtRole };

export type PlanningPostView = {
  id: string;
  /** "AAAA-MM-DD" */
  date: string | null;
  /** "sex 06/03" */
  dateLabel: string | null;
  network: SocialNetwork | null;
  kind: PostKind;
  /** A etapa que o cliente vê: a arte (com os arquivos) ou só a pauta (o texto). */
  stage: "pauta" | "arte";
  headline: string;
  supportText: string | null;
  slides: PostSlide[];
  scenes: PostScene[];
  copy: string;
  cta: string | null;
  hashtags: string[];
  /** As artes na ordem, com a capa no fim (vazio na etapa de pauta). */
  art: PlanningArtView[];
  /** A legenda mudou depois da pauta aprovada: o texto aprovado, para comparar. */
  briefCaption: BriefCaption | null;
};

/** Um post de mês anterior no feed (arte aprovada): mais apagado e sem respostas. */
export type PlanningPastPostView = PlanningPostView & { monthLabel: string };

/** Uma resposta enviada sobre um post (do cliente, ou registrada pela Double One em nome dele). */
export type PlanningAnswerView = {
  decision: "approved" | "changes";
  comment: string | null;
  byName: string;
  byTeam: boolean;
  dateLabel: string;
};

/** A situação de um post no portal: se espera resposta, o rascunho e as respostas já enviadas. */
export type PortalPostStateView = {
  /** O post do envio que espera resposta (null: nada esperando). */
  sendPostId: string | null;
  draft: { decision: "approved" | "changes"; comment: string | null; byName: string } | null;
  /** A última resposta enviada da etapa que o cliente vê. */
  last: PlanningAnswerView | null;
  history: PlanningAnswerView[];
};

/** O perfil do cliente no feed simulado. */
export type PlanningProfileView = { name: string; logoUrl: string | null; instagramHandle: string | null };
