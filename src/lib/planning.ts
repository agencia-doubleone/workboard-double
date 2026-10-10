// Planejamentos de redes sociais: status, redes e formatos, compartilhados
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

/** Tipo do formato, pelo texto livre ("Card estático", "Carrossel — 3 cards", "Reel — 30 s"...): define o ícone. */
export type PostFormatKind = "static" | "carousel" | "reel" | "stories" | "video";

export function formatKind(format: string | null | undefined): PostFormatKind {
  const text = (format ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (text.includes("carross")) return "carousel";
  if (text.includes("reel")) return "reel";
  if (text.includes("stor")) return "stories";
  if (text.includes("video")) return "video";
  return "static";
}

/** Formatos sugeridos no cadastro (o campo aceita qualquer texto). */
export const FORMAT_SUGGESTIONS = ["Card estático", "Carrossel", "Reel", "Stories", "Vídeo"] as const;

/** Uma seção livre do post (Tema central, Texto de apoio, Abordagem, Roteiro...). */
export type PostSection = { label: string; text: string };

export const PLANNING_LIMITS = {
  overview: 200_000,
  concept: 10_000,
  document: 200_000,
  headline: 1_000,
  copy: 10_000,
  topic: 200,
  format: 120,
  sectionLabel: 120,
  sectionText: 10_000,
  sections: 30,
  postsPerImport: 100,
} as const;
