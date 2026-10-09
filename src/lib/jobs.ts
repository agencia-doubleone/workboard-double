// Regras e rótulos de trabalhos, compartilhados entre servidor e navegador.

export const JOB_PAGE_SIZES = [30, 50, 100] as const;
export const DEFAULT_JOB_PAGE_SIZE = 30;

/** Recortes da lista. "abertos" = ativos e com status que não encerra. */
export const JOB_SITUATIONS = {
  abertos: "Em aberto",
  concluidos: "Concluídos",
  inativos: "Inativos",
  todos: "Todos",
} as const;
export type JobSituation = keyof typeof JOB_SITUATIONS;
export const DEFAULT_JOB_SITUATION: JobSituation = "abertos";

export function isJobSituation(value: unknown): value is JobSituation {
  return typeof value === "string" && value in JOB_SITUATIONS;
}

export const JOB_NAME_MAX_LENGTH = 200;
export const JOB_BRIEFING_MAX_LENGTH = 200_000;
export const JOB_ASSIGNEES_MAX = 20;
export const MESSAGE_MAX_LENGTH = 5000;
export const MESSAGE_ATTACHMENTS_MAX = 10;
export const STATUS_NAME_MAX_LENGTH = 40;

// Menções: no texto salvo ficam como <@userId>; na tela, como "@Nome".
const MENTION = /<@([A-Za-z0-9_-]{1,64})>/g;

export function mentionToken(userId: string) {
  return `<@${userId}>`;
}

/** Ids mencionados num texto salvo, sem repetir. */
export function extractMentions(body: string) {
  return [...new Set([...body.matchAll(MENTION)].map((match) => match[1]))];
}

export type MessagePart = { type: "text"; text: string } | { type: "mention"; userId: string };

/** Quebra o texto salvo em trechos de texto e menções, para exibir. */
export function splitMentions(body: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    if (match.index > last) parts.push({ type: "text", text: body.slice(last, match.index) });
    parts.push({ type: "mention", userId: match[1] });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

/** Hoje em "AAAA-MM-DD" no fuso da agência, para comparar com a data de entrega. */
export function todayInSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Atrasado: tem entrega, ela já passou e o trabalho ainda não foi encerrado. */
export function isOverdue(dueDate: string | null, isFinal: boolean, today: string) {
  return Boolean(dueDate) && !isFinal && dueDate! < today;
}
