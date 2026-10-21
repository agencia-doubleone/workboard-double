// Formas serializáveis que as páginas de planejamentos entregam aos client components.

import type {
  ApprovalStage,
  ArtMediaKind,
  ArtRole,
  ArtState,
  BriefState,
  DecisionSide,
  PlanningStatus,
  PostKind,
  PostScene,
  PostSlide,
  SocialNetwork,
} from "@/lib/planning";

export type PlanningPersonView = { id: string; name: string; imageUrl: string | null };

export type PlanningFormValues = {
  planningId?: string;
  clientId: string | null;
  networks: SocialNetwork[];
  /** Texto do campo (vira número ao salvar). */
  postsPerMonth: string;
  overview: string;
  memberIds: string[];
  /** "Aprovar pauta": o cliente aprova o texto antes das artes. */
  approvesBrief: boolean;
};

export type PostView = {
  id: string;
  /** "AAAA-MM-DD" */
  date: string | null;
  /** "qua 02/09" */
  dateLabel: string | null;
  network: SocialNetwork | null;
  kind: PostKind;
  headline: string;
  supportText: string | null;
  copy: string;
  cta: string | null;
  hashtags: string[];
  slides: PostSlide[];
  scenes: PostScene[];
  /** Observações dos posts do formato antigo. */
  notes: string | null;
  status: PlanningStatus;
  briefState: BriefState;
  /** Quem aprovou a pauta e quando ("21/10"). */
  briefDecision: { byName: string; side: DecisionSide; dateLabel: string } | null;
  artState: ArtState;
  /** As artes da versão atual, na ordem (capa no fim). */
  art: ArtItemView[];
  /** Está com o cliente, esperando resposta nesta etapa (o que ele vê fica travado). */
  waiting: ApprovalStage | null;
  /** A alteração que o cliente pediu na etapa em que o post está (a mais recente). */
  changesRequest: { stage: ApprovalStage; comment: string; byName: string; dateLabel: string } | null;
  /** Respostas e acontecimentos, do mais antigo para o mais novo. */
  history: PostHistoryItem[];
};

export type PostHistoryItem = { id: string; text: string; comment: string | null; dateLabel: string };

/** Um envio ao cliente que ainda espera resposta. */
export type PendingSendView = {
  id: string;
  stage: ApprovalStage;
  sentByName: string;
  sentAtLabel: string;
  total: number;
  waiting: number;
  answered: number;
};

/** Uma arte de post (imagem ou vídeo no CDN). */
export type ArtItemView = { mediaId: string; url: string; name: string; kind: ArtMediaKind; role: ArtRole };

export type MonthView = {
  /** "AAAA-MM" */
  month: string;
  /** "setembro de 2026" */
  label: string;
  /** O mês já foi começado (tem linha no banco). */
  started: boolean;
  status: PlanningStatus;
  concept: string | null;
  /** O texto colado do Word, dos meses importados antes do JSON (só leitura). */
  document: string | null;
};
