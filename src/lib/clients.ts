// Regras e rótulos de clientes, compartilhados entre servidor e navegador.

/** Faixa etária do público-alvo, em anos. 0–100 é "todas as idades". */
export const AGE_MIN = 0;
export const AGE_MAX = 100;

export const GENDERS = {
  masculino: "Masculino",
  feminino: "Feminino",
} as const;
export type Gender = keyof typeof GENDERS;
export const GENDER_VALUES = Object.keys(GENDERS) as Gender[];

export const SOCIAL_CLASSES = ["A", "B", "C", "D", "E"] as const;
export type SocialClass = (typeof SOCIAL_CLASSES)[number];

/** Links do cliente, na ordem em que aparecem no formulário e na página. */
export const CLIENT_LINKS = {
  website: { label: "Site", placeholder: "https://cliente.com.br" },
  instagram: { label: "Instagram", placeholder: "https://instagram.com/cliente" },
  facebook: { label: "Facebook", placeholder: "https://facebook.com/cliente" },
  linkedin: { label: "LinkedIn", placeholder: "https://linkedin.com/company/cliente" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@cliente" },
} as const;
export type ClientLink = keyof typeof CLIENT_LINKS;
export const CLIENT_LINK_KEYS = Object.keys(CLIENT_LINKS) as ClientLink[];

export const CLIENT_NAME_MAX_LENGTH = 120;
export const CLIENT_NOTES_MAX_LENGTH = 100_000;

export function formatAgeRange(min: number, max: number) {
  if (min <= AGE_MIN && max >= AGE_MAX) return "Todas as idades";
  if (min <= AGE_MIN) return `Até ${max} anos`;
  if (max >= AGE_MAX) return `A partir de ${min} anos`;
  return `De ${min} a ${max} anos`;
}

export function formatGenders(genders: readonly string[]) {
  const labels = GENDER_VALUES.filter((gender) => genders.includes(gender)).map((gender) => GENDERS[gender]);
  if (labels.length === 0 || labels.length === GENDER_VALUES.length) return "Todos";
  return labels.join(", ");
}

export function formatSocialClasses(classes: readonly string[]) {
  const selected = SOCIAL_CLASSES.filter((value) => classes.includes(value));
  if (selected.length === 0 || selected.length === SOCIAL_CLASSES.length) return "Todas";
  return selected.join(", ");
}

/** "https://www.cliente.com.br/contato" -> "cliente.com.br/contato" */
export function displayUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}
