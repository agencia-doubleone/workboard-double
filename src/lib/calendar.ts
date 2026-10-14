// Datas do calendário: dias puros "AAAA-MM-DD" (como a entrega e o aniversário),
// sem fuso. As contas usam Date em UTC só como calculadora.

/** "2026-10" */
export type MonthKey = string;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });

/** Semana começando no domingo, como no seletor de datas (date-fns ptBR). */
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function toUtc(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function fromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function monthOf(day: string): MonthKey {
  return day.slice(0, 7);
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return fromUtc(date).slice(0, 7);
}

/** "outubro de 2026" */
export function formatMonth(month: MonthKey) {
  return monthLabel.format(toUtc(`${month}-01`));
}

/** "sexta-feira, 9 de outubro" */
export function formatDay(day: string) {
  return dayLabel.format(toUtc(day));
}

/** "sex., 9 de out." */
export function formatShortDay(day: string) {
  return shortDayLabel.format(toUtc(day));
}

/** "10 de março" (data que repete todo ano). */
export function formatDayMonth(day: string) {
  return dayMonthLabel.format(toUtc(day));
}

/** "sex 09/10": cabe numa coluna estreita. */
export function formatCompactDay(day: string) {
  return `${WEEKDAYS[toUtc(day).getUTCDay()].toLowerCase()} ${day.slice(8)}/${day.slice(5, 7)}`;
}

/**
 * Os dias da grade do mês: de domingo da semana do dia 1 até sábado da semana
 * do último dia (5 ou 6 semanas), com os de fora do mês nas pontas.
 */
export function monthGrid(month: MonthKey) {
  const first = toUtc(`${month}-01`);
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const last = toUtc(`${shiftMonth(month, 1)}-01`);
  last.setUTCDate(0);
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));

  const days: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(fromUtc(cursor));
  }
  return { days, from: days[0], to: days[days.length - 1] };
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Em que dia o aniversário cai em cada ano do intervalo (o intervalo do
 * calendário cruza no máximo uma virada de ano). Quem nasceu em 29/02 comemora
 * em 28/02 nos anos que não são bissextos.
 */
export function birthdayOccurrences(birthday: string, from: string, to: string) {
  const monthDay = birthday.slice(5);
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const days: string[] = [];
  for (const year of years) {
    const day = monthDay === "02-29" && !isLeapYear(year) ? `${year}-02-28` : `${year}-${monthDay}`;
    if (day >= from && day <= to) days.push(day);
  }
  return days;
}

/**
 * Em que dias uma data (de cliente) cai no intervalo: a que repete todo ano
 * cai como um aniversário, do próprio dia em diante; a outra, só no dia.
 */
export function occasionOccurrences(day: string, yearly: boolean, from: string, to: string) {
  if (!yearly) return day >= from && day <= to ? [day] : [];
  return birthdayOccurrences(day, from, to).filter((occurrence) => occurrence >= day);
}

/** A próxima vez que a data cai, hoje inclusive (null: não repete e já passou). */
export function nextOccurrence(day: string, yearly: boolean, today: string) {
  if (day >= today) return day;
  if (!yearly) return null;
  return occasionOccurrences(day, true, today, `${Number(today.slice(0, 4)) + 1}-12-31`)[0] ?? null;
}

/** "Hoje", "Amanhã", "Em 12 dias" (até um dia de hoje em diante). */
export function formatUntil(day: string, today: string) {
  const days = Math.round((toUtc(day).getTime() - toUtc(today).getTime()) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `Em ${days} dias`;
}
