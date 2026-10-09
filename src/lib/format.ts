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
