// Saudação do header, checagem de aniversário e datas especiais, no fuso da
// agência (o servidor roda em UTC). Usadas no servidor, ao montar o menu da conta.

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

// Datas especiais: a saudação muda e, ao abrir o sistema, sobe uma animação do
// tema (uma vez por dia em cada navegador). Valem por alguns dias, para quem
// não trabalha no feriado também ver. O aniversário da pessoa vem antes.

export type Holiday = "halloween" | "christmas" | "new-year";

/** Período de cada data ("MM-DD", inclusive). O Ano Novo vira o ano. */
const HOLIDAYS: { id: Holiday; from: string; to: string }[] = [
  { id: "halloween", from: "10-29", to: "10-31" },
  { id: "christmas", from: "12-20", to: "12-26" },
  { id: "new-year", from: "12-30", to: "01-02" },
];

/** A data especial de hoje (no fuso da agência), ou null. */
export function getHoliday(now: Date): Holiday | null {
  const { month, day } = getParts(now);
  const today = `${month}-${day}`;
  const found = HOLIDAYS.find(({ from, to }) => (from <= to ? today >= from && today <= to : today >= from || today <= to));
  return found?.id ?? null;
}

/** A saudação da data especial: "Feliz Natal, Ana!". */
export function getHolidayGreeting(holiday: Holiday, firstName: string, now: Date) {
  const { year, month } = getParts(now);
  switch (holiday) {
    case "halloween":
      return `Gostosuras ou travessuras, ${firstName}?`;
    case "christmas":
      return `Feliz Natal, ${firstName}!`;
    case "new-year":
      // Antes da virada, "Feliz Ano Novo"; depois, já com o ano que começou.
      return month === "12" ? `Feliz Ano Novo, ${firstName}!` : `Feliz ${year}, ${firstName}!`;
  }
}

/**
 * O "hoje" das datas especiais e aniversários. Em desenvolvimento,
 * GREETING_PREVIEW_DATE (.env.local, "AAAA-MM-DD") finge outra data, para conferir.
 */
export function specialDayNow(now: Date, preview: string | undefined) {
  return process.env.NODE_ENV === "development" && preview ? new Date(`${preview}T15:00:00Z`) : now;
}

/** Quantos anos a empresa completa hoje (fundação em "AAAA-MM-DD"), ou null se não é o aniversário dela. */
export function companyAnniversaryYears(foundedOn: string | null | undefined, now: Date) {
  if (!foundedOn || !isBirthdayToday(foundedOn, now)) return null;
  const years = getParts(now).year - Number(foundedOn.slice(0, 4));
  return years > 0 ? years : null;
}

/** Primeiro nome, para a saudação. */
export function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
