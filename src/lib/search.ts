// Busca global (Ctrl+K): tipos dos resultados e o tratamento do texto buscado.
// Compartilhado entre servidor e navegador (sem banco).

/** Mínimo de letras para buscar (números, como o PIT, buscam com qualquer tamanho). */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
/** Palavras levadas em conta (as demais são ignoradas). */
const SEARCH_MAX_WORDS = 6;

export type SearchKind =
  | "page"
  | "job"
  | "client"
  | "message"
  | "file"
  | "link"
  | "credential"
  | "board"
  | "planning";

export type SearchResult = {
  /** Único na lista (tipo + id). */
  key: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  href: string;
  /** Abre em outra aba (arquivo no CDN, site externo). */
  external?: boolean;
  /** Caminho de pasta do drive: escolher copia em vez de abrir. */
  copy?: string;
  /** Status do trabalho, com as cores do cadastro. */
  status?: { name: string; textColor: string; backgroundColor: string };
  /** Selo curto: "Arquivado", "Inativo"... */
  badge?: string;
  /** Logo do cliente ou foto de quem escreveu. */
  imageUrl?: string | null;
  /** Nome para as iniciais quando não há imagem. */
  imageName?: string;
};

export type SearchGroup = {
  kind: SearchKind;
  label: string;
  results: SearchResult[];
  /** "Ver todos" na página da lista, quando há uma. */
  more?: { label: string; href: string };
};

/** Minúsculas e sem acento: "Criação" e "criacao" se encontram. */
export function foldText(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** As palavras buscadas, já sem acento (todas precisam aparecer, em qualquer ordem). */
export function searchWords(query: string) {
  return foldText(query.slice(0, SEARCH_MAX_LENGTH))
    .split(/\s+/)
    .map((word) => word.replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, SEARCH_MAX_WORDS);
}

/** Vale a pena buscar? (2 letras, ou um número como o PIT). */
export function isSearchable(query: string) {
  const trimmed = query.trim().replace(/^#/, "");
  return /^\d+$/.test(trimmed) || trimmed.length >= SEARCH_MIN_LENGTH;
}

/** O PIT, se a busca é só um número ("123" ou "#123"). */
export function searchPit(query: string) {
  const match = query.trim().match(/^#?(\d{1,9})$/);
  return match ? Number(match[1]) : null;
}

/** Todas as palavras aparecem no texto (sem acento)? */
export function matchesWords(text: string, words: string[]) {
  const folded = foldText(text);
  return words.every((word) => folded.includes(word));
}

/**
 * Trecho em volta da primeira palavra encontrada (o texto inteiro, se curto),
 * em uma linha só: "…as fotos do evento estão no drive…".
 */
export function searchSnippet(text: string, words: string[], max = 120) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const folded = foldText(flat);
  const positions = words.map((word) => folded.indexOf(word)).filter((position) => position >= 0);
  const hit = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, Math.min(hit - Math.floor(max / 3), flat.length - max));
  const piece = flat.slice(start, start + max).trim();
  return `${start > 0 ? "…" : ""}${piece}${start + max < flat.length ? "…" : ""}`;
}
