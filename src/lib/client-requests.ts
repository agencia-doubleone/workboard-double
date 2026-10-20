import { z } from "zod";

// Solicitações do portal do cliente: status, recortes da lista e os filtros na
// URL. Compartilhado entre servidor e navegador (sem banco), e entre a tela da
// equipe (/solicitacoes, admins) e a do portal (/portal/solicitacoes).

/**
 * Lista fixa (não é cadastro, como os status de trabalho). A ordem é a do
 * caminho de uma solicitação; as `closed` encerram (saem de "Em aberto").
 * Cada status tem um tom próprio (fora da cor de destaque, igual para a
 * equipe e o cliente): cinza na fila, azul em análise, verde-água no
 * orçamento, âmbar esperando o cliente aprovar, roxo em execução, e verde,
 * vermelho ou apagado quando encerra. Os tons ficam em RequestStatusBadge.
 */
export const REQUEST_STATUSES = {
  aguardando_analise: { label: "Aguardando análise", tone: "neutral", closed: false },
  em_analise: { label: "Em análise", tone: "blue", closed: false },
  aguardando_orcamento: { label: "Aguardando orçamento", tone: "teal", closed: false },
  aguardando_aprovacao: { label: "Aguardando aprovação", tone: "amber", closed: false },
  em_execucao: { label: "Em execução", tone: "violet", closed: false },
  finalizada: { label: "Finalizada", tone: "green", closed: true },
  negada: { label: "Negada", tone: "red", closed: true },
  cancelada: { label: "Cancelada", tone: "muted", closed: true },
} as const;
export type RequestStatusTone = (typeof REQUEST_STATUSES)[keyof typeof REQUEST_STATUSES]["tone"];
export type RequestStatus = keyof typeof REQUEST_STATUSES;
export const REQUEST_STATUS_KEYS = Object.keys(REQUEST_STATUSES) as [RequestStatus, ...RequestStatus[]];
/** Toda solicitação nasce aqui. */
export const INITIAL_REQUEST_STATUS: RequestStatus = "aguardando_analise";

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && value in REQUEST_STATUSES;
}

/** A equipe acabou de finalizar a solicitação: confetes e som na tela de quem marcou (como nos trabalhos). */
export function isRequestCompletion(previous: RequestStatus, next: RequestStatus) {
  return next === "finalizada" && previous !== "finalizada";
}

/** O cliente só cancela a própria solicitação enquanto ninguém da agência começou a olhar. */
export function canClientCancel(status: RequestStatus) {
  return status === INITIAL_REQUEST_STATUS;
}

/** De que lado veio uma mensagem ou troca de status: a agência ou o cliente. */
export type RequestSide = "team" | "client";

/**
 * Passou da previsão de entrega sem encerrar. `today` é o dia de hoje em
 * Brasília ("AAAA-MM-DD", todayInSaoPaulo), como nos trabalhos.
 */
export function isRequestOverdue(expectedOn: string | null, status: RequestStatus, today: string) {
  return Boolean(expectedOn) && !REQUEST_STATUSES[status].closed && expectedOn! < today;
}

// Andamento: além das trocas de status (client_request_status_history), o que
// a equipe muda e o cliente vê na linha do tempo (client_request_event).

/** Campos que a equipe edita e que aparecem no andamento quando mudam. */
export const REQUEST_EDITED_FIELDS = { title: "assunto", briefing: "briefing" } as const;
export type RequestEditedField = keyof typeof REQUEST_EDITED_FIELDS;

/** O que cada registro do andamento guarda (`data` em client_request_event). */
export type RequestEventData = {
  /** Previsão de entrega informada, trocada ou tirada ("AAAA-MM-DD" ou null). */
  expected_on: { from: string | null; to: string | null };
  /** Assunto ou briefing editados pela equipe. */
  edited: { fields: RequestEditedField[] };
  /** A equipe mandou uma rodada para aprovação (retirar a rodada apaga este registro). */
  delivery_sent: { deliveryId: string; round: number; files: number };
  /** O cliente respondeu à rodada: quantos arquivos aprovou e em quantos pediu alteração. */
  delivery_answered: { deliveryId: string; round: number; approved: number; changes: number };
};
export type RequestEventType = keyof RequestEventData;

/**
 * Evento do navegador (window) disparado quando a página de uma solicitação
 * marca a leitura: o sino do portal reconta na hora.
 */
export const REQUEST_READ_EVENT = "wb:request-read";

/** "S-12": o número da solicitação, para não confundir com o PIT dos trabalhos. */
export function requestCode(number: number) {
  return `S-${number}`;
}

/** O número, se a busca é só ele: "12", "S-12", "s12" ou "#12". */
export function requestNumberInQuery(query: string) {
  const match = query.trim().match(/^(?:s-?\s*|#)?(\d{1,9})$/i);
  return match ? Number(match[1]) : null;
}

// Entregas para aprovação: a equipe manda arquivos em rodadas (1, 2...) e o
// cliente responde arquivo por arquivo. As respostas ficam como rascunho até
// ele "Enviar respostas" (com todos os arquivos respondidos); aí a rodada
// fecha e a equipe é avisada. Só uma rodada espera resposta por vez: mandar
// outra deixa a anterior como "Substituída".

export const DELIVERY_STATUSES = {
  pending: { label: "Aguardando aprovação", badge: "warning" },
  approved: { label: "Aprovada", badge: "success" },
  changes_requested: { label: "Alterações pedidas", badge: "destructive" },
  superseded: { label: "Substituída", badge: "outline" },
} as const;
export type DeliveryStatus = keyof typeof DELIVERY_STATUSES;

export const DELIVERY_DECISIONS = {
  approved: { label: "Aprovado", badge: "success" },
  changes: { label: "Alteração pedida", badge: "destructive" },
} as const;
export type DeliveryDecision = keyof typeof DELIVERY_DECISIONS;

export const DELIVERY_FILES_MAX = 20;
export const DELIVERY_NOTE_MAX_LENGTH = 50_000;
export const DELIVERY_COMMENT_MAX_LENGTH = 2_000;

/** Mandar uma rodada põe a solicitação em "Aguardando aprovação"; a resposta do cliente, em "Em execução". */
export const STATUS_WHEN_DELIVERY_SENT: RequestStatus = "aguardando_aprovacao";
export const STATUS_WHEN_DELIVERY_ANSWERED: RequestStatus = "em_execucao";

/** Como a rodada fecha: tudo aprovado, ou alguma alteração pedida. */
export function deliveryOutcome(decisions: (DeliveryDecision | null)[]): Extract<DeliveryStatus, "approved" | "changes_requested"> {
  return decisions.every((decision) => decision === "approved") ? "approved" : "changes_requested";
}

/** "2 aprovados e 1 com alteração", "3 aprovados". */
export function deliveryAnswerSummary(approved: number, changes: number) {
  const parts = [
    approved > 0 ? `${approved} ${approved === 1 ? "aprovado" : "aprovados"}` : null,
    changes > 0 ? `${changes} com alteração` : null,
  ].filter(Boolean);
  return parts.join(" e ") || "sem arquivos";
}

export const REQUEST_TITLE_MAX_LENGTH = 200;
export const REQUEST_BRIEFING_MAX_LENGTH = 200_000;

// Lista

export const REQUEST_SITUATIONS = {
  abertas: "Em aberto",
  encerradas: "Encerradas",
  todas: "Todas",
} as const;
export type RequestSituation = keyof typeof REQUEST_SITUATIONS;
export const DEFAULT_REQUEST_SITUATION: RequestSituation = "abertas";

export const REQUEST_PAGE_SIZES = [30, 50, 100] as const;
export const DEFAULT_REQUEST_PAGE_SIZE = 30;

/** Status que entram num recorte. */
export function statusesOfSituation(situation: RequestSituation) {
  if (situation === "todas") return REQUEST_STATUS_KEYS;
  const closed = situation === "encerradas";
  return REQUEST_STATUS_KEYS.filter((status) => REQUEST_STATUSES[status].closed === closed);
}

/** Filtros na URL (?busca=&situacao=&status=&cliente=&porPagina=&pagina=). `cliente` só vale na tela da equipe. */
export type RequestListParams = {
  busca?: string;
  situacao: RequestSituation;
  status?: RequestStatus;
  cliente?: string;
  porPagina: number;
  pagina: number;
};

const SITUATION_VALUES = Object.keys(REQUEST_SITUATIONS) as [RequestSituation, ...RequestSituation[]];

// Parâmetros inválidos são ignorados, nunca quebram a página.
const searchSchema = z.object({
  busca: z.string().trim().max(100).optional().catch(undefined),
  situacao: z.enum(SITUATION_VALUES).catch(DEFAULT_REQUEST_SITUATION),
  status: z.enum(REQUEST_STATUS_KEYS).optional().catch(undefined),
  cliente: z.uuid().optional().catch(undefined),
  porPagina: z.coerce
    .number()
    .refine((value) => (REQUEST_PAGE_SIZES as readonly number[]).includes(value))
    .catch(DEFAULT_REQUEST_PAGE_SIZE),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseRequestListParams(raw: Record<string, string | string[] | undefined>): RequestListParams {
  const parsed = searchSchema.parse({
    busca: first(raw.busca),
    situacao: first(raw.situacao) ?? DEFAULT_REQUEST_SITUATION,
    status: first(raw.status),
    cliente: first(raw.cliente),
    porPagina: first(raw.porPagina) ?? DEFAULT_REQUEST_PAGE_SIZE,
    pagina: first(raw.pagina) ?? 1,
  });
  return { ...parsed, busca: parsed.busca || undefined };
}

/** Endereço da lista com os filtros; valores padrão ficam fora da URL. */
export function requestListHref(params: RequestListParams, path: string) {
  const query = new URLSearchParams();
  if (params.busca) query.set("busca", params.busca);
  if (params.situacao !== DEFAULT_REQUEST_SITUATION) query.set("situacao", params.situacao);
  if (params.status) query.set("status", params.status);
  if (params.cliente) query.set("cliente", params.cliente);
  if (params.porPagina !== DEFAULT_REQUEST_PAGE_SIZE) query.set("porPagina", String(params.porPagina));
  if (params.pagina > 1) query.set("pagina", String(params.pagina));
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** "12" da URL (/solicitacoes/12); qualquer outra coisa é null (404). */
export function parseRequestNumber(value: string) {
  return /^\d{1,9}$/.test(value) ? Number(value) : null;
}
