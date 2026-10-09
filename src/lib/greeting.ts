// Saudação do header e checagem de aniversário, no fuso da agência (o
// servidor roda em UTC). Usadas no servidor, ao montar o menu da conta.

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function getParts(now: Date) {
  const values = Object.fromEntries(parts.formatToParts(now).map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: values.month, day: values.day, hour: Number(values.hour) };
}

/** "Bom dia" (5h–11h), "Boa tarde" (12h–17h) ou "Boa noite". */
export function getGreeting(now: Date) {
  const { hour } = getParts(now);
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Hoje é o aniversário? Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos. */
export function isBirthdayToday(birthday: string | null | undefined, now: Date) {
  if (!birthday) return false;
  const [, month, day] = birthday.split("-");
  const today = getParts(now);
  if (month === today.month && day === today.day) return true;
  const leapYear = new Date(today.year, 1, 29).getMonth() === 1;
  return month === "02" && day === "29" && today.month === "02" && today.day === "28" && !leapYear;
}

/** Primeiro nome, para a saudação. */
export function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
