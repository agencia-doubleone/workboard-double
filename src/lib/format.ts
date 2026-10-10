// Datas sempre no fuso da agência: o servidor (Vercel) roda em UTC.
const TIME_ZONE = "America/Sao_Paulo";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: TIME_ZONE,
});

const relativeFormat = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TIME_ZONE });
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const shortDateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });

/** "14:32" no fuso da agência. */
export function formatTime(date: Date) {
  return timeFormat.format(date);
}

/** O dia no fuso da agência, "AAAA-MM-DD" (para agrupar por dia). */
export function dayKey(date: Date) {
  return dayKeyFormat.format(date);
}

/** "hoje", "ontem", "08/10" (ou "08/10/2025", se de outro ano). */
export function formatDayLabel(date: Date, now: Date) {
  const day = dayKey(date);
  if (day === dayKey(now)) return "hoje";
  if (day === dayKey(new Date(now.getTime() - 86_400_000))) return "ontem";
  return day.slice(0, 4) === dayKey(now).slice(0, 4) ? shortDateFormat.format(date) : dateFormat.format(date);
}

/** "hoje, 14:32", "ontem, 09:10", "08/10, 14:32" (ou com ano, se de outro ano). */
export function formatMessageTime(date: Date, now: Date) {
  return `${formatDayLabel(date, now)}, ${formatTime(date)}`;
}

export function formatDate(date: Date) {
  return dateFormat.format(date);
}

/** Data pura "AAAA-MM-DD" (ex.: aniversário) em "dd/mm/aaaa", sem passar por fuso. */
export function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

/** "há 5 minutos", "ontem"... Acima de 30 dias, cai para a data. */
export function formatRelative(date: Date, now: Date) {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return "agora há pouco";
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return relativeFormat.format(Math.round(seconds / 86_400), "day");
  return formatDate(date);
}
