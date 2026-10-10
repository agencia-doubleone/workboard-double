// Relatórios (admins): abas, períodos e as definições usadas nas contas.
// Compartilhado entre servidor e navegador (sem banco).
//
// Definições:
// - Concluído: o status atual encerra (isFinal); a data da conclusão é
//   job.statusChangedAt (quando entrou nesse status).
// - No prazo: concluído no dia da entrega ou antes (dia no fuso da agência).
// - Tempo até concluir: da criação (lançamento) até a conclusão.
// - Em aberto: ativo e com status que não encerra. Atrasado: em aberto com a entrega já passada.
//
// Planejamentos (contados por mês, não por dia):
// - Meses do período: todos os meses que o período toca (1 a 10/10 = outubro inteiro).
// - Um mês conta para um cliente se já foi começado (tem linha no banco) ou, com o
//   cliente ativo, se é do mês em que o planejamento foi criado em diante.
// - Posts aprovados: aprovados ou finalizados (isApprovedStatus). Ajustes: posts em
//   "Ajustes pedidos" agora. A meta é a de hoje (postsPerMonth não tem histórico).
// - Mês atrasado: o mês já começou e o planejamento dele não está aprovado nem finalizado.

import { formatMonth, monthOf, shiftMonth } from "@/lib/calendar";

export const REPORT_TABS = {
  geral: "Visão geral",
  clientes: "Por cliente",
  equipe: "Por funcionário",
  prazos: "Prazos",
  etapas: "Etapas",
  planejamentos: "Planejamentos",
} as const;
export type ReportTab = keyof typeof REPORT_TABS;

export function isReportTab(value: unknown): value is ReportTab {
  return typeof value === "string" && value in REPORT_TABS;
}

export const PERIOD_PRESETS = {
  "este-mes": "Este mês",
  "mes-passado": "Mês passado",
  "30-dias": "Últimos 30 dias",
  "90-dias": "Últimos 90 dias",
  "este-ano": "Este ano",
} as const;
export type PeriodPreset = keyof typeof PERIOD_PRESETS;
export const DEFAULT_PERIOD_PRESET: PeriodPreset = "este-mes";

/** Dias "AAAA-MM-DD", inclusive. */
export type Period = { from: string; to: string };

/** Período mais longo aceito (um relatório de vários anos fica lento e ilegível). */
export const MAX_PERIOD_DAYS = 3 * 366;

/** Trabalho em aberto sem mudar de status há tantos dias aparece como "parado". */
export const STALLED_AFTER_DAYS = 14;
/** "Vencem em breve": a entrega cai nos próximos tantos dias. */
export const UPCOMING_DAYS = 7;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtc(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function fromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, amount: number) {
  return fromUtc(new Date(toUtc(day).getTime() + amount * DAY_MS));
}

/** Dias corridos de `from` até `to` (0 = mesmo dia). */
export function dayDiff(from: string, to: string) {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

export function isValidDay(value: unknown): value is string {
  return typeof value === "string" && ISO_DAY.test(value) && fromUtc(toUtc(value)) === value;
}

/** O período de um atalho, contado a partir de `today` (dia no fuso da agência). */
export function presetPeriod(preset: PeriodPreset, today: string): Period {
  const month = today.slice(0, 7);
  switch (preset) {
    case "este-mes":
      return { from: `${month}-01`, to: today };
    case "mes-passado": {
      const lastOfPrevious = addDays(`${month}-01`, -1);
      return { from: `${lastOfPrevious.slice(0, 7)}-01`, to: lastOfPrevious };
    }
    case "30-dias":
      return { from: addDays(today, -29), to: today };
    case "90-dias":
      return { from: addDays(today, -89), to: today };
    case "este-ano":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** Qual atalho gera exatamente esse período (null = personalizado). */
export function matchPreset(period: Period, today: string): PeriodPreset | null {
  for (const preset of Object.keys(PERIOD_PRESETS) as PeriodPreset[]) {
    const candidate = presetPeriod(preset, today);
    if (candidate.from === period.from && candidate.to === period.to) return preset;
  }
  return null;
}

/** "01/10/2026 a 31/10/2026" */
export function formatPeriod(period: Period) {
  const format = (day: string) => day.split("-").reverse().join("/");
  return period.from === period.to ? format(period.from) : `${format(period.from)} a ${format(period.to)}`;
}

/** Os meses ("AAAA-MM") que o período toca, em ordem. */
export function monthsInPeriod(period: Period) {
  const months: string[] = [];
  const last = monthOf(period.to);
  for (let month = monthOf(period.from); month <= last; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

/** "outubro de 2026" ou "setembro de 2026 a outubro de 2026". */
export function formatMonthSpan(months: string[]) {
  if (months.length === 0) return "";
  const first = formatMonth(months[0]);
  return months.length === 1 ? first : `${first} a ${formatMonth(months[months.length - 1])}`;
}

/** "3,5 dias", "1 dia", "menos de 1 dia". */
export function formatDays(days: number | null) {
  if (days === null) return "—";
  if (days < 1) return "menos de 1 dia";
  const rounded = Math.round(days * 10) / 10;
  return `${rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${rounded === 1 ? "dia" : "dias"}`;
}

/** "87%" (ou "—" sem base). */
export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
