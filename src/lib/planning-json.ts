import { z } from "zod";

import { formatMonth, monthOf, type MonthKey } from "@/lib/calendar";
import { formatCalendarDate } from "@/lib/format";
import {
  JSON_POST_KINDS,
  keepKindParts,
  parseHashtags,
  PLANNING_LIMITS,
  type PostKind,
  type PostScene,
  type PostSlide,
} from "@/lib/planning";

// Lê o JSON padrão do planejamento (o que a IA devolve com o prompt de
// src/lib/planning-prompt.ts) e transforma nos posts do Workboard. Roda no
// navegador, para a prévia; o servidor valida de novo o resultado (importPostsSchema).
//
//   { "posts": [{ "data": "2026-10-02", "tipo": "estatico" | "carrossel" | "reels",
//                 "headline", "textoApoio", "copy", "cta", "hashtags": ["#..."],
//                 "slides": [{ "headline", "textoApoio" }],   (carrossel)
//                 "cenas": [{ "texto" }] }] }                  (reels)
//
// Campo de texto ausente vale null. Um post fora do padrão (data, tipo, tipos de
// valor) barra a importação inteira, com o erro de cada um: o certo é pedir para
// a IA corrigir, não importar pela metade.

export type ImportedPost = {
  /** "AAAA-MM-DD" */
  date: string;
  kind: PostKind;
  headline: string;
  supportText: string | null;
  copy: string;
  cta: string | null;
  hashtags: string[];
  slides: PostSlide[];
  scenes: PostScene[];
};

export type PlanningJsonResult = { ok: true; posts: ImportedPost[]; warnings: string[] } | { ok: false; errors: string[] };

const POST_KEYS = new Set(["data", "tipo", "headline", "textoApoio", "copy", "cta", "hashtags", "slides", "cenas"]);
const MAX_ERRORS = 10;

/** Texto: aceita null ou ausente; quebras de linha do Windows viram "\n"; vazio vira null. */
const text = (max: number) =>
  z
    .string("precisa ser um texto ou null")
    .nullish()
    .transform((value) => value?.replace(/\r\n?/g, "\n").trim() || null)
    .refine((value) => !value || value.length <= max, `passou de ${max.toLocaleString("pt-BR")} caracteres`);

const jsonPost = z.object({
  data: z.iso.date("precisa ser uma data no formato AAAA-MM-DD"),
  tipo: z.enum(JSON_POST_KINDS, "precisa ser estatico, carrossel ou reels"),
  headline: text(PLANNING_LIMITS.headline),
  textoApoio: text(PLANNING_LIMITS.supportText),
  copy: text(PLANNING_LIMITS.copy),
  cta: text(PLANNING_LIMITS.cta),
  hashtags: z.array(z.string("precisa ser um texto"), "precisa ser uma lista de textos").nullish(),
  slides: z
    .array(
      z.object({ headline: text(PLANNING_LIMITS.headline), textoApoio: text(PLANNING_LIMITS.supportText) }, "precisa ser um objeto"),
      "precisa ser uma lista",
    )
    .nullish(),
  cenas: z.array(z.object({ texto: text(PLANNING_LIMITS.sceneText) }, "precisa ser um objeto"), "precisa ser uma lista").nullish(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "`headline`", "`headline` do slide 3", "a cena 2", "a hashtag 4". */
function describePath(path: PropertyKey[]) {
  const [field, index, inner] = path;
  const item = typeof index === "number" ? index + 1 : null;
  if (field === "slides" && item) return inner ? `\`${String(inner)}\` do slide ${item}` : `o slide ${item}`;
  if (field === "cenas" && item) return inner ? `\`${String(inner)}\` da cena ${item}` : `a cena ${item}`;
  if (field === "hashtags" && item) return `a hashtag ${item}`;
  return field === undefined ? "o post" : `\`${String(field)}\``;
}

/** O JSON com um erro de sintaxe: aponta a linha e a coluna quando o navegador diz a posição. */
function syntaxError(source: string, error: unknown) {
  const position = Number(error instanceof Error ? error.message.match(/position (\d+)/)?.[1] : NaN);
  const where = Number.isFinite(position)
    ? (() => {
        const before = source.slice(0, position).split("\n");
        return ` (erro perto da linha ${before.length}, coluna ${before[before.length - 1].length + 1})`;
      })()
    : "";
  return `O texto não é um JSON válido${where}. Confira vírgulas e aspas, ou peça para a IA gerar de novo.`;
}

/** Tira o bloco de código Markdown (```json ... ```) que a IA às vezes devolve mesmo pedindo que não. */
function stripCodeFence(source: string) {
  return source.match(/^```[\w-]*[ \t]*\n([\s\S]*?)\n?```\s*$/)?.[1] ?? source;
}

/** Lê o JSON; se falhar, tenta só o trecho de "{" até "}" (a IA às vezes escreve algo antes ou depois). */
function readJson(source: string): { ok: true; data: unknown; trimmed: boolean } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(source), trimmed: false };
  } catch (error) {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start > 0 || (end >= 0 && end < source.length - 1)) {
      try {
        return { ok: true, data: JSON.parse(source.slice(start, end + 1)), trimmed: true };
      } catch {
        // Continua com o erro do texto inteiro, que aponta a posição certa.
      }
    }
    return { ok: false, error: syntaxError(source, error) };
  }
}

export function parsePlanningJson(input: string, month: MonthKey): PlanningJsonResult {
  const source = stripCodeFence(input.replace(/^﻿/, "").trim());
  if (!source) return { ok: false, errors: ["Cole o JSON do planejamento."] };
  if (source.length > PLANNING_LIMITS.importText) return { ok: false, errors: ["O JSON é grande demais."] };

  const read = readJson(source);
  if (!read.ok) return { ok: false, errors: [read.error] };
  const { data } = read;
  if (!isRecord(data) || !Array.isArray(data.posts)) {
    return { ok: false, errors: ['O JSON precisa ter a lista "posts" na raiz: { "posts": [ ... ] }.'] };
  }
  if (data.posts.length === 0) return { ok: false, errors: ['A lista "posts" está vazia.'] };
  if (data.posts.length > PLANNING_LIMITS.postsPerImport) {
    return { ok: false, errors: [`No máximo ${PLANNING_LIMITS.postsPerImport} posts por importação.`] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const ignored = new Set(Object.keys(data).filter((key) => key !== "posts"));
  const posts: ImportedPost[] = [];

  data.posts.forEach((raw: unknown, index) => {
    const dateLabel = isRecord(raw) && typeof raw.data === "string" ? ` (${formatCalendarDate(raw.data)})` : "";
    const label = `Post ${index + 1}${dateLabel}`;
    if (!isRecord(raw)) {
      errors.push(`${label}: precisa ser um objeto { ... }.`);
      return;
    }
    for (const key of Object.keys(raw)) if (!POST_KEYS.has(key)) ignored.add(key);

    const parsed = jsonPost.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${label}: ${describePath(issue.path)} ${issue.message}.`);
      return;
    }
    const post = parsed.data;
    const hashtags = parseHashtags(post.hashtags ?? []);
    const slides = (post.slides ?? [])
      .map((slide) => ({ headline: slide.headline, supportText: slide.textoApoio }))
      .filter((slide) => slide.headline || slide.supportText);
    const scenes = (post.cenas ?? []).flatMap((scene) => (scene.texto ? [{ text: scene.texto }] : []));

    if (hashtags.length > PLANNING_LIMITS.hashtags) errors.push(`${label}: no máximo ${PLANNING_LIMITS.hashtags} hashtags.`);
    if (hashtags.some((tag) => tag.length > PLANNING_LIMITS.hashtag)) errors.push(`${label}: tem uma hashtag longa demais.`);
    if (slides.length > PLANNING_LIMITS.slides) errors.push(`${label}: no máximo ${PLANNING_LIMITS.slides} slides.`);
    if (scenes.length > PLANNING_LIMITS.scenes) errors.push(`${label}: no máximo ${PLANNING_LIMITS.scenes} cenas.`);

    if (monthOf(post.data) !== month) warnings.push(`${label}: a data está fora de ${formatMonth(month)}.`);
    if (post.tipo !== "carrossel" && slides.length > 0) warnings.push(`${label}: tem slides, mas não é carrossel. Os slides ficam de fora.`);
    if (post.tipo !== "reels" && scenes.length > 0) warnings.push(`${label}: tem cenas, mas não é Reels. As cenas ficam de fora.`);
    if (post.tipo === "carrossel" && slides.length === 0) warnings.push(`${label}: carrossel sem slides.`);
    if (post.tipo === "reels" && scenes.length === 0) warnings.push(`${label}: Reels sem cenas.`);
    if (!post.headline && !post.copy) warnings.push(`${label}: sem headline nem copy.`);

    posts.push(
      keepKindParts({
        date: post.data,
        kind: post.tipo,
        headline: post.headline ?? "",
        supportText: post.textoApoio,
        copy: post.copy ?? "",
        cta: post.cta,
        hashtags,
        slides,
        scenes,
      }),
    );
  });

  if (errors.length > 0) {
    const extra = errors.length - MAX_ERRORS;
    return { ok: false, errors: extra > 0 ? [...errors.slice(0, MAX_ERRORS), `E mais ${extra} ${extra === 1 ? "erro" : "erros"}.`] : errors };
  }
  if (ignored.size > 0) {
    warnings.unshift(`Campos fora do padrão, ignorados: ${[...ignored].map((key) => `"${key}"`).join(", ")}.`);
  }
  if (read.trimmed) warnings.unshift("Havia texto fora do JSON; só o JSON foi lido.");
  return { ok: true, posts, warnings };
}
