// Quadros brancos: regras compartilhadas entre servidor e navegador (sem banco).
// O desenho é do Excalidraw; cada elemento (post-it, traço, imagem...) é guardado
// à parte em `whiteboard_element`, com a versão que o Excalidraw dá a ele.

export const WHITEBOARD_ACCESS = {
  private: { label: "Pessoal", description: "Só você vê e edita." },
  members: {
    label: "Pessoas escolhidas",
    description: "Você e quem você escolher. Vinculado a um trabalho, os funcionários dele entram também.",
  },
  team: { label: "Toda a equipe", description: "Todos os funcionários ativos veem e editam." },
} as const;
export type WhiteboardAccess = keyof typeof WHITEBOARD_ACCESS;
export const WHITEBOARD_ACCESS_KEYS = Object.keys(WHITEBOARD_ACCESS) as WhiteboardAccess[];

export function isWhiteboardAccess(value: unknown): value is WhiteboardAccess {
  return typeof value === "string" && value in WHITEBOARD_ACCESS;
}

export const WHITEBOARD_LIMITS = {
  title: 120,
  members: 100,
  /** Elementos por gravação (o navegador divide em lotes). */
  elementsPerSave: 500,
  /** Um elemento (um traço longo de lápis tem muitos pontos). */
  elementBytes: 256 * 1024,
  /** Miniatura da lista (data URL). */
  previewBytes: 300 * 1024,
} as const;

/**
 * Tipos de elemento aceitos (gravação e sala ao vivo). Ficam de fora os que o
 * Excalidraw usa com IA ("iframe", "magicframe"), que rodam HTML de terceiros.
 */
export const WHITEBOARD_ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "frame",
  "embeddable",
] as const;
export type WhiteboardElementType = (typeof WHITEBOARD_ELEMENT_TYPES)[number];

/** O mínimo que um elemento do Excalidraw tem; o resto vai como veio. */
export type StoredElement = {
  id: string;
  type: WhiteboardElementType;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  [key: string]: unknown;
};

/** Post-it da paleta do quadro (retângulo com customData.sticky). */
export function isStickyElement(element: StoredElement) {
  const data = element.customData as { sticky?: unknown } | undefined;
  return element.type === "rectangle" && data?.sticky === true;
}

/** Confere o formato básico de um elemento que chegou de fora (outra aba, banco). */
export function isStoredElement(value: unknown): value is StoredElement {
  if (typeof value !== "object" || value === null) return false;
  const element = value as Record<string, unknown>;
  return (
    typeof element.id === "string" &&
    element.id.length > 0 &&
    element.id.length <= 64 &&
    WHITEBOARD_ELEMENT_TYPES.includes(element.type as WhiteboardElementType) &&
    Number.isInteger(element.version) &&
    Number.isInteger(element.versionNonce) &&
    typeof element.isDeleted === "boolean"
  );
}

/** Cores dos post-its (tons claros da paleta do Excalidraw: o texto preto fica legível). */
export const STICKY_COLORS = [
  { name: "Amarelo", fill: "#ffec99" },
  { name: "Rosa", fill: "#ffc9c9" },
  { name: "Verde", fill: "#b2f2bb" },
  { name: "Azul", fill: "#a5d8ff" },
  { name: "Lilás", fill: "#d0bfff" },
] as const;

/** Cores dos cursores de quem está no quadro (fixas por pessoa). */
const COLLABORATOR_COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599", "#c2255c", "#5f3dc4"];

export function collaboratorColor(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
}

/** Recortes da lista de quadros (todos os que a pessoa vê, os que ela criou...). */
export const WHITEBOARD_SCOPES = ["todos", "meus", "pessoais", "trabalhos"] as const;
export type WhiteboardScope = (typeof WHITEBOARD_SCOPES)[number];

/** Pasta do CDN das imagens coladas nos quadros. */
export const WHITEBOARD_MEDIA_FOLDER = "quadros";

export function whiteboardHref(id: string) {
  return `/quadros/${id}`;
}
