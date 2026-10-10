import type { MonthKey } from "@/lib/calendar";
import type { PostSection } from "@/lib/planning";

// Lê o texto colado do Word (planejamento editorial do mês) e separa em posts.
// O modelo mais comum na agência:
//
//   Planejamento Editorial — Setembro de 2026
//   Conceito editorial do mês
//   <texto>
//   Calendário  (tabela: ignorada, os posts trazem os mesmos dados)
//   01 — 02/09 | DIREITO EMPRESARIAL      ← começa um post (número, data, tema)
//   Headline / Texto de apoio / CTA / Linha editorial / Formato / Descrição /
//   Abordagem / Copy / CTA: ... / Hashtags: ...   ← rótulos em linhas próprias
//
// Headline, Copy (com o CTA e as hashtags que vêm depois dela) e Formato viram
// campos do post; os outros rótulos viram seções, na ordem do documento, para
// documentos com seções a mais ou a menos continuarem funcionando. Roda no
// navegador (prévia) e de novo no servidor não precisa: o servidor valida o resultado.

export type ParsedPost = {
  /** "01", "02"... como veio no documento. */
  number: string | null;
  /** "AAAA-MM-DD" */
  date: string | null;
  /** O que vem depois da data no cabeçalho (ex.: "DIREITO EMPRESARIAL"). */
  topic: string | null;
  headline: string;
  /** A legenda: o texto da Copy, com o CTA e as hashtags que vêm depois dela. */
  copy: string;
  format: string | null;
  sections: PostSection[];
};

export type ParsedPlanning = {
  /** Mês citado no título ("Setembro de 2026"), se houver. */
  month: MonthKey | null;
  /** "Conceito editorial do mês". */
  concept: string | null;
  posts: ParsedPost[];
  warnings: string[];
};

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Minúsculas, sem acento, espaços simples e sem ":" no fim (para comparar rótulos). */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/:\s*$/, "")
    .trim();
}

// Cabeçalhos de post.
const DASH = "[—–-]";
/** "01 — 02/09 | DIREITO EMPRESARIAL" (número, data e tema). */
const HEADER_NUMBERED = new RegExp(
  `^(\\d{1,2})\\s*${DASH}\\s*(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\s*(?:(?:\\||${DASH})\\s*(.*))?$`,
);
/** "Post 3", "Post 3 — 12/09 | Tema". */
const HEADER_POST = new RegExp(
  `^post\\s*(\\d{1,3})\\b\\s*(?:(?:\\||${DASH}|:)\\s*)?(?:(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?)?\\s*(?:(?:\\||${DASH}|:)\\s*)?(.*)$`,
  "i",
);
/** "02/09 | Tema" ou "02/09 — Tema" (data e tema, sem número). */
const HEADER_DATED = new RegExp(`^(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\s*(?:\\||${DASH})\\s*(.+)$`);

type Header = { number: string | null; day: number | null; month: number | null; year: number | null; topic: string | null };

function readHeader(line: string): Header | null {
  const toNumber = (value: string | undefined) => (value ? Number(value) : null);
  const topic = (value: string | undefined) => value?.trim().replace(/^[|—–:-]\s*/, "") || null;
  let match = line.match(HEADER_NUMBERED);
  if (match) {
    return { number: match[1].padStart(2, "0"), day: toNumber(match[2]), month: toNumber(match[3]), year: toNumber(match[4]), topic: topic(match[5]) };
  }
  match = line.match(HEADER_POST);
  if (match) {
    return { number: match[1].padStart(2, "0"), day: toNumber(match[2]), month: toNumber(match[3]), year: toNumber(match[4]), topic: topic(match[5]) };
  }
  match = line.match(HEADER_DATED);
  if (match) return { number: null, day: toNumber(match[1]), month: toNumber(match[2]), year: toNumber(match[3]), topic: topic(match[4]) };
  return null;
}

// Rótulos dentro de um post.
type LabelKind = "headline" | "copy" | "format" | "cta" | "hashtags" | "section";

const SECTION_LABELS = new Set([
  "tema central",
  "tema",
  "texto de apoio",
  "apoio",
  "subheadline",
  "linha editorial",
  "descricao",
  "abordagem",
  "observacoes",
  "observacao",
  "referencias",
  "referencia",
  "briefing da arte",
  "objetivo",
  "publico",
  "texto da arte",
]);

function labelKind(text: string): LabelKind | null {
  const label = normalize(text);
  if (/^headline(\s*[—–-]\s*card\s*\d+)?$/.test(label) || label === "titulo") return "headline";
  if (label === "copy" || label === "legenda") return "copy";
  if (label === "formato") return "format";
  if (label === "cta") return "cta";
  if (label === "hashtags" || label === "hashtag") return "hashtags";
  if (SECTION_LABELS.has(label) || /^card\s*\d+$/.test(label) || /^roteiro\b/.test(label)) return "section";
  return null;
}

type Block = { kind: LabelKind; label: string; lines: string[]; inline: boolean; raw: string };

/** Rótulo sozinho na linha ("Headline") ou com o texto na mesma linha ("CTA: Conheça..."). */
function readLabel(line: string): Omit<Block, "lines"> & { content: string | null } | null {
  const kind = labelKind(line);
  if (kind) return { kind, label: line.replace(/:\s*$/, "").trim(), inline: false, raw: line, content: null };
  const colon = line.indexOf(":");
  if (colon > 0) {
    const inlineKind = labelKind(line.slice(0, colon));
    const content = line.slice(colon + 1).trim();
    if (inlineKind && content) {
      return { kind: inlineKind, label: line.slice(0, colon).trim(), inline: true, raw: line, content };
    }
  }
  return null;
}

/** Junta as linhas de um bloco: parágrafos separados por uma linha em branco, sem sobras. */
function joinLines(lines: string[]) {
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Card 1"... no rótulo da headline de carrossel vira só "Headline". */
function displayLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

/** Data do post: o ano vem do documento ou é o mais perto do mês do planejamento. */
function resolveDate(day: number | null, month: number | null, year: number | null, reference: MonthKey) {
  if (!day || !month || day > 31 || month > 12) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (year) {
    const full = year < 100 ? 2000 + year : year;
    return `${full}-${pad(month)}-${pad(day)}`;
  }
  const [referenceYear, referenceMonth] = reference.split("-").map(Number);
  const target = referenceYear * 12 + referenceMonth;
  const best = [referenceYear - 1, referenceYear, referenceYear + 1].sort(
    (a, b) => Math.abs(a * 12 + month - target) - Math.abs(b * 12 + month - target),
  )[0];
  const date = `${best}-${pad(month)}-${pad(day)}`;
  // 31/02 e afins: descarta.
  const check = new Date(`${date}T12:00:00Z`);
  return check.getUTCMonth() + 1 === month ? date : null;
}

function buildPost(header: Header, lines: string[], reference: MonthKey): ParsedPost {
  const blocks: Block[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const current = blocks.at(-1);
    if (!line) {
      if (current && current.lines.length > 0) current.lines.push("");
      continue;
    }
    const label = readLabel(line);
    if (label) {
      blocks.push({ kind: label.kind, label: label.label, inline: label.inline, raw: label.raw, lines: label.content ? [label.content] : [] });
      continue;
    }
    if (!current) blocks.push({ kind: "section", label: "Notas", inline: false, raw: "", lines: [line] });
    else current.lines.push(line);
  }

  const copyIndex = blocks.findIndex((block) => block.kind === "copy");
  const headline = blocks.find((block) => block.kind === "headline");
  const format = blocks.find((block) => block.kind === "format");
  const copyParts: string[] = [];
  const sections: PostSection[] = [];
  blocks.forEach((block, index) => {
    const text = joinLines(block.lines);
    if (block === headline || block === format) return;
    if (block.kind === "copy" && index === copyIndex) {
      copyParts.push(text);
      return;
    }
    // Depois da Copy, CTA e hashtags fazem parte da legenda.
    if (copyIndex >= 0 && index > copyIndex && (block.kind === "cta" || block.kind === "hashtags")) {
      copyParts.push(block.kind === "cta" ? (block.inline ? block.raw.trim() : `CTA: ${text}`) : text);
      return;
    }
    if (!text) return;
    sections.push({ label: block.kind === "cta" ? "CTA" : displayLabel(block.label), text });
  });

  return {
    number: header.number,
    date: resolveDate(header.day, header.month, header.year, reference),
    topic: header.topic,
    headline: headline ? joinLines(headline.lines) : "",
    copy: copyParts.filter(Boolean).join("\n\n"),
    format: format ? (joinLines(format.lines).split("\n")[0] ?? null) : null,
    sections,
  };
}

/** O conceito do mês: o texto depois de "Conceito editorial", até a tabela "Calendário" (ou o primeiro post). */
function readConcept(lines: string[]) {
  const start = lines.findIndex((line) => normalize(line).startsWith("conceito"));
  if (start < 0) return null;
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const label = normalize(line);
    if (label === "calendario" || label === "cronograma" || label === "pautas") break;
    content.push(line.trim());
  }
  return joinLines(content) || null;
}

function readMonth(lines: string[]): MonthKey | null {
  for (const line of lines.slice(0, 5)) {
    const match = normalize(line).match(/(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})/);
    if (match) return `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}`;
  }
  return null;
}

export function parsePlanningDocument(text: string, reference: MonthKey): ParsedPlanning {
  const raw = text.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n");
  // Colada do Word, uma linha de tabela vem com as células separadas por tabulação:
  // nunca abre um post (a tabela "Calendário" repete as datas dos posts).
  const headerIndexes = raw.flatMap((line, index) => (!line.includes("\t") && readHeader(line.trim()) ? [index] : []));
  const lines = raw.map((line) => line.replace(/\t+/g, " | ").trimEnd());
  const intro = lines.slice(0, headerIndexes[0] ?? lines.length);
  const month = readMonth(intro.filter((line) => line.trim()));
  const posts = headerIndexes.map((start, position) => {
    const end = headerIndexes[position + 1] ?? lines.length;
    return buildPost(readHeader(lines[start].trim())!, lines.slice(start + 1, end), month ?? reference);
  });

  const warnings: string[] = [];
  if (posts.length === 0) {
    warnings.push("Nenhum post encontrado. O texto fica guardado como documento do mês, e os posts podem ser cadastrados à mão.");
  }
  const label = (post: ParsedPost, index: number) => `Post ${post.number ?? index + 1}`;
  posts.forEach((post, index) => {
    if (!post.headline) warnings.push(`${label(post, index)}: sem headline.`);
    if (!post.copy) warnings.push(`${label(post, index)}: sem copy (legenda).`);
    if (!post.date) warnings.push(`${label(post, index)}: sem data.`);
  });
  if (month && month !== reference) {
    warnings.push("O título do documento cita outro mês. Confira se está importando no mês certo.");
  }

  return { month, concept: readConcept(intro), posts, warnings };
}
