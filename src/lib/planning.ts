// Planejamentos de redes sociais: status, redes e tipos de post, compartilhados
// entre servidor e navegador (sem banco).

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
