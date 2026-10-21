// Planejamentos de redes sociais: status, redes e tipos de post, compartilhados
// entre servidor e navegador (sem banco).

import { monthOf, shiftMonth, type MonthKey } from "@/lib/calendar";

/**
 * O mês que os planejamentos abrem sem `?mes=`: o seguinte ao de hoje, porque a
 * equipe trabalha no conteúdo do mês que vem. `today`: "AAAA-MM-DD" em Brasília.
 */
export function defaultPlanningMonth(today: string): MonthKey {
  return shiftMonth(monthOf(today), 1);
}

/** O mesmo fluxo vale para o mês e para cada post (os dois andam de forma independente). */
export const PLANNING_STATUSES = {
  producao: { label: "Em produção", badge: "outline" },
  aprovacao: { label: "Aguardando aprovação", badge: "warning" },
  ajustes: { label: "Ajustes pedidos", badge: "destructive" },
  aprovado: { label: "Aprovado", badge: "success" },
  finalizado: { label: "Finalizado", badge: "soft" },
} as const;
export type PlanningStatus = keyof typeof PLANNING_STATUSES;
export const PLANNING_STATUS_KEYS = Object.keys(PLANNING_STATUSES) as [PlanningStatus, ...PlanningStatus[]];
export const DEFAULT_PLANNING_STATUS: PlanningStatus = "producao";

export function isPlanningStatus(value: unknown): value is PlanningStatus {
  return typeof value === "string" && value in PLANNING_STATUSES;
}

/** Post conta como "aprovado" no progresso do mês: aprovado ou já finalizado. */
export function isApprovedStatus(status: PlanningStatus) {
  return status === "aprovado" || status === "finalizado";
}

// O status do post com a etapa (planejamentos com "Aprovar pauta"): os status
// de andamento ganham "Pauta ·" ou "Arte ·". No banco continua o status de
// sempre; a etapa sai da pauta (aprovada = já é a vez da arte).

const STAGED_STATUSES = ["producao", "aprovacao", "ajustes"] as const satisfies readonly PlanningStatus[];
type StagedStatus = (typeof STAGED_STATUSES)[number];
export type PostStatusValue = PlanningStatus | `${"pauta" | "arte"}:${StagedStatus}`;

/** Todos os valores do seletor do post com etapa, na ordem do trabalho. */
export const STAGED_POST_STATUS_VALUES: PostStatusValue[] = [
  ...STAGED_STATUSES.map((status) => `pauta:${status}` as const),
  ...STAGED_STATUSES.map((status) => `arte:${status}` as const),
  "aprovado",
  "finalizado",
];

/** A etapa em que o post está (null: o planejamento não aprova pauta). */
export function postStageOf(planning: { approvesBrief: boolean }, post: { briefState: string }): "pauta" | "arte" | null {
  if (!planning.approvesBrief) return null;
  return post.briefState === "aprovada" ? "arte" : "pauta";
}

export function postStatusValue(stage: "pauta" | "arte" | null, status: PlanningStatus): PostStatusValue {
  return stage && (STAGED_STATUSES as readonly string[]).includes(status) ? `${stage}:${status as StagedStatus}` : status;
}

export function parsePostStatusValue(value: string): { stage: "pauta" | "arte" | null; status: PlanningStatus } | null {
  const [first, second] = value.split(":");
  if (second === undefined) return isPlanningStatus(first) ? { stage: null, status: first } : null;
  if ((first !== "pauta" && first !== "arte") || !(STAGED_STATUSES as readonly string[]).includes(second)) return null;
  return { stage: first, status: second as StagedStatus };
}

/** "Pauta · Aguardando aprovação", "Aprovado". */
export function postStatusLabel(value: PostStatusValue) {
  const parsed = parsePostStatusValue(value)!;
  const definition = PLANNING_STATUSES[parsed.status];
  return { label: parsed.stage ? `${parsed.stage === "pauta" ? "Pauta" : "Arte"} · ${definition.label}` : definition.label, badge: definition.badge };
}

/** O mês foi concluído agora (entrou em "Finalizado"): comemora na tela de quem marcou. */
export function isPlanningCompletion(previous: PlanningStatus, next: PlanningStatus) {
  return next === "finalizado" && previous !== "finalizado";
}

export const SOCIAL_NETWORKS = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
} as const;
export type SocialNetwork = keyof typeof SOCIAL_NETWORKS;
export const SOCIAL_NETWORK_KEYS = Object.keys(SOCIAL_NETWORKS) as [SocialNetwork, ...SocialNetwork[]];

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return typeof value === "string" && value in SOCIAL_NETWORKS;
}

/**
 * Tipos de post. Os três primeiros são os do JSON padrão (`tipo`, ver
 * src/lib/planning-json.ts); Stories e Vídeo só existem no cadastro manual.
 * `parts`: o que o tipo tem além da legenda (slides do carrossel, cenas do roteiro).
 */
export const POST_KINDS = {
  estatico: { label: "Estático", parts: null },
  carrossel: { label: "Carrossel", parts: "slides" },
  reels: { label: "Reels", parts: "scenes" },
  stories: { label: "Stories", parts: "slides" },
  video: { label: "Vídeo", parts: "scenes" },
} as const satisfies Record<string, { label: string; parts: "slides" | "scenes" | null }>;
export type PostKind = keyof typeof POST_KINDS;
export const POST_KIND_KEYS = Object.keys(POST_KINDS) as [PostKind, ...PostKind[]];
/** Os tipos aceitos no JSON padrão. */
export const JSON_POST_KINDS = ["estatico", "carrossel", "reels"] as const satisfies readonly PostKind[];
export const DEFAULT_POST_KIND: PostKind = "estatico";

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === "string" && value in POST_KINDS;
}

/** Um card do carrossel (ou tela do Stories). */
export type PostSlide = { headline: string | null; supportText: string | null };
/** Uma cena do roteiro (Reels ou Vídeo). */
export type PostScene = { text: string };

/** Slides só no carrossel/Stories e cenas só no Reels/Vídeo: trocar o tipo descarta o que não vale mais. */
export function keepKindParts<T extends { kind: PostKind; slides: PostSlide[]; scenes: PostScene[] }>(post: T): T {
  const parts = POST_KINDS[post.kind].parts;
  return { ...post, slides: parts === "slides" ? post.slides : [], scenes: parts === "scenes" ? post.scenes : [] };
}

/** "#tag": sem espaços e com um # só na frente ("" se não sobrar nada). */
export function normalizeHashtag(value: string) {
  const tag = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return tag ? `#${tag}` : "";
}

/** Hashtags de um texto livre ("#a #b, c") ou de uma lista: normalizadas e sem repetir (ignorando maiúsculas). */
export function parseHashtags(input: string | readonly string[]) {
  const values = typeof input === "string" ? input.split(/[\s,;]+/) : input;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = normalizeHashtag(value);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

/** A legenda pronta para publicar: copy, CTA e hashtags, separados por uma linha em branco. */
export function composeCaption(post: { copy: string; cta: string | null; hashtags: readonly string[] }) {
  return [post.copy.trim(), post.cta?.trim(), post.hashtags.join(" ")].filter(Boolean).join("\n\n");
}

// Aprovação dos posts (ver docs/planejamentos-no-portal.md): a pauta (o texto)
// só existe nos planejamentos com "Aprovar pauta" (`planning.approvesBrief`);
// a arte (os arquivos) passa sempre pelo cliente.

/** Etapas da aprovação de um post. */
export const APPROVAL_STAGES = { pauta: "Pauta", arte: "Arte" } as const;
export type ApprovalStage = keyof typeof APPROVAL_STAGES;

/** Situação da pauta: rascunho (não foi ao cliente) → enviada → aprovada ou alterações pedidas. */
export const BRIEF_STATES = {
  rascunho: { label: "Rascunho", badge: "outline" },
  enviada: { label: "Enviada", badge: "warning" },
  aprovada: { label: "Aprovada", badge: "success" },
  alteracoes: { label: "Alterações pedidas", badge: "destructive" },
} as const;
export type BriefState = keyof typeof BRIEF_STATES;

/** Situação da arte: sem arte → pronta (subiu, não foi ao cliente) → enviada → aprovada ou alterações pedidas. */
export const ART_STATES = {
  sem_arte: { label: "Sem arte", badge: "outline" },
  pronta: { label: "Pronta", badge: "soft" },
  enviada: { label: "Enviada", badge: "warning" },
  aprovada: { label: "Aprovada", badge: "success" },
  alteracoes: { label: "Alterações pedidas", badge: "destructive" },
} as const;
export type ArtState = keyof typeof ART_STATES;

/** Quem decidiu: o cliente pelo portal ou um admin em nome dele. */
export type DecisionSide = "team" | "client";

/** A arte já foi ao cliente: trocar guarda a versão anterior (o comentário dele fala dela). */
export function isArtShared(state: ArtState) {
  return state === "enviada" || state === "aprovada" || state === "alteracoes";
}

/** Copy, CTA e hashtags como estavam quando a pauta foi aprovada (para comparar com a legenda final). */
export type BriefCaption = { copy: string; cta: string | null; hashtags: string[] };

/** "art": a arte (imagens ou vídeos, na ordem); "cover": a capa do Reels ou do vídeo. */
export const ART_ROLES = ["art", "cover"] as const;
export type ArtRole = (typeof ART_ROLES)[number];
export type ArtMediaKind = "image" | "video";

/** O que cada tipo de post aceita de arte. O carrossel do Instagram vai até 20 imagens. */
export const POST_ART_RULES = {
  estatico: { max: 1, accepts: ["image"], cover: false, label: "1 imagem" },
  carrossel: { max: 20, accepts: ["image"], cover: false, label: "2 a 20 imagens, na ordem" },
  reels: { max: 1, accepts: ["video"], cover: true, label: "1 vídeo e a capa" },
  stories: { max: 20, accepts: ["image", "video"], cover: false, label: "Imagens ou vídeos, na ordem" },
  video: { max: 1, accepts: ["video"], cover: true, label: "1 vídeo e a capa" },
} as const satisfies Record<PostKind, { max: number; accepts: readonly ArtMediaKind[]; cover: boolean; label: string }>;

/** Extensões aceitas nas artes (um subconjunto de MEDIA_TYPES). */
const ART_EXTENSIONS: Record<string, ArtMediaKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
};

/** Imagem ou vídeo de arte pelo nome do arquivo (null: não serve como arte). */
export function artMediaKind(fileName: string): ArtMediaKind | null {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? (ART_EXTENSIONS[fileName.slice(dot + 1).toLowerCase()] ?? null) : null;
}

/** O .mov sobe, mas nem todo navegador toca. */
export function isRiskyVideo(fileName: string) {
  return fileName.toLowerCase().endsWith(".mov");
}

export const ART_ACCEPT = Object.keys(ART_EXTENSIONS)
  .map((extension) => `.${extension}`)
  .join(",");

/** As artes que valem para o tipo: arte no limite e no formato do tipo, capa só quando o tipo tem. */
export function keepValidArt<T extends { role: ArtRole; kind: ArtMediaKind }>(kind: PostKind, items: readonly T[]) {
  const rules = POST_ART_RULES[kind];
  const art = items.filter((item) => item.role === "art" && (rules.accepts as readonly ArtMediaKind[]).includes(item.kind));
  const cover = rules.cover ? items.filter((item) => item.role === "cover" && item.kind === "image").slice(0, 1) : [];
  return [...art.slice(0, rules.max), ...cover];
}

/**
 * Pode subir ou trocar a arte: sem "Aprovar pauta", sempre; com, só depois da
 * pauta aprovada (ou se o post já tinha arte quando a opção foi ligada).
 */
export function canUploadArt(planning: { approvesBrief: boolean }, post: { briefState: BriefState; hasArt: boolean }) {
  return !planning.approvesBrief || post.briefState === "aprovada" || post.hasArt;
}

/** Os campos da pauta que tiram a aprovação dela ao mudar (a legenda não: D10). */
export function briefChanged(
  before: { kind: PostKind; headline: string; supportText: string | null; slides: PostSlide[]; scenes: PostScene[] },
  after: { kind: PostKind; headline: string; supportText: string | null; slides: PostSlide[]; scenes: PostScene[] },
) {
  return (
    before.kind !== after.kind ||
    before.headline !== after.headline ||
    (before.supportText ?? null) !== (after.supportText ?? null) ||
    JSON.stringify(before.slides) !== JSON.stringify(after.slides) ||
    JSON.stringify(before.scenes) !== JSON.stringify(after.scenes)
  );
}

/** Copy, CTA ou hashtags mudaram. */
export function captionChanged(before: BriefCaption, after: BriefCaption) {
  return before.copy !== after.copy || (before.cta ?? null) !== (after.cta ?? null) || before.hashtags.join(" ") !== after.hashtags.join(" ");
}

/**
 * O post já tem algo que a importação com "Substituir" não pode apagar: arte,
 * ou pauta que saiu do rascunho (enviada, aprovada, com alteração pedida).
 */
export function isPostLocked(post: { briefState: BriefState; artState: ArtState }) {
  return post.briefState !== "rascunho" || post.artState !== "sem_arte";
}

/** Um envio ao cliente: esperando, respondido (todos os posts dele) ou retirado pela equipe. */
export type PlanningSendStatus = "pending" | "answered" | "withdrawn";
/** Um post dentro de um envio. */
export type PlanningSendPostState = "pending" | "answered" | "withdrawn";
export type ReviewDecision = "approved" | "changes";

/** O post pode ir ao cliente nesta etapa (sem contar se já está num envio pendente). */
export function canSendStage(
  planning: { approvesBrief: boolean },
  post: { briefState: BriefState; artState: ArtState; hasArt: boolean },
  stage: ApprovalStage,
) {
  if (stage === "pauta") return planning.approvesBrief && (post.briefState === "rascunho" || post.briefState === "alteracoes");
  return (
    post.hasArt &&
    (post.artState === "pronta" || post.artState === "alteracoes") &&
    (!planning.approvesBrief || post.briefState === "aprovada")
  );
}

/** O post está com o cliente, esperando resposta (em alguma etapa): os campos que ele vê ficam travados. */
export function isWaitingClient(post: { briefState: BriefState; artState: ArtState }) {
  return post.briefState === "enviada" || post.artState === "enviada";
}

/** Status do post depois de uma resposta (D3): pauta aprovada volta a produzir (a arte); arte aprovada aprova o post. */
export function statusAfterDecision(current: PlanningStatus, stage: ApprovalStage, decision: ReviewDecision): PlanningStatus {
  if (current === "finalizado") return current;
  if (decision === "changes") return "ajustes";
  if (stage === "arte") return "aprovado";
  return current === "aprovado" ? current : "producao";
}

export const PLANNING_REVIEW_COMMENT_MAX = 5_000;
export const PLANNING_SEND_NOTE_MAX = 50_000;

/** Histórico do post fora das respostas (planning_post_event). */
export type PlanningPostEventData =
  | { type: "approval_kept"; stages: ApprovalStage[] }
  | { type: "approval_removed"; stages: ApprovalStage[] }
  | { type: "brief_approval_undone" }
  | { type: "date_changed"; from: string | null; to: string | null }
  | { type: "network_changed"; from: SocialNetwork | null; to: SocialNetwork | null }
  | { type: "sent"; stage: ApprovalStage }
  | { type: "withdrawn"; stage: ApprovalStage };
export type PlanningPostEventType = PlanningPostEventData["type"];

export const PLANNING_LIMITS = {
  overview: 200_000,
  concept: 10_000,
  headline: 1_000,
  supportText: 5_000,
  copy: 10_000,
  cta: 1_000,
  hashtag: 100,
  hashtags: 60,
  slides: 30,
  scenes: 60,
  sceneText: 5_000,
  notes: 20_000,
  postsPerImport: 100,
  /** Tamanho do JSON colado ou do arquivo. */
  importText: 1_000_000,
} as const;
