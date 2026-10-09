import {
  AGE_MAX,
  AGE_MIN,
  CLIENT_LINK_KEYS,
  formatAgeRange,
  formatGenders,
  formatSocialClasses,
  GENDER_VALUES,
  SOCIAL_CLASSES,
  type Gender,
  type SocialClass,
} from "@/lib/clients";
import type { ClientRecord } from "@/server/clients";
import type { ClientFormValues, ClientLinkItem } from "./types";

type Links = Pick<ClientRecord, "website" | "instagram" | "facebook" | "linkedin" | "youtube">;
type Audience = Pick<ClientRecord, "ageMin" | "ageMax" | "genders" | "socialClasses">;

export function clientLinks(row: Links): ClientLinkItem[] {
  return CLIENT_LINK_KEYS.flatMap((key) => (row[key] ? [{ key, url: row[key] }] : []));
}

/** Resumo de uma linha: "De 18 a 45 anos · Feminino · Classes B, C". Sem filtros, "Todos os públicos". */
export function describeAudience(row: Audience) {
  const parts: string[] = [];
  if (row.ageMin > AGE_MIN || row.ageMax < AGE_MAX) parts.push(formatAgeRange(row.ageMin, row.ageMax));
  const genders = formatGenders(row.genders);
  if (genders !== "Todos") parts.push(genders);
  const classes = formatSocialClasses(row.socialClasses);
  if (classes !== "Todas") parts.push(`Classe${row.socialClasses.length > 1 ? "s" : ""} ${classes}`);
  return parts.length ? parts.join(" · ") : "Todos os públicos";
}

export function toFormValues(row: ClientRecord, logoUrl: string | null): ClientFormValues {
  return {
    clientId: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl,
    website: row.website ?? "",
    instagram: row.instagram ?? "",
    facebook: row.facebook ?? "",
    linkedin: row.linkedin ?? "",
    youtube: row.youtube ?? "",
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    genders: row.genders.filter((value): value is Gender => (GENDER_VALUES as string[]).includes(value)),
    socialClasses: row.socialClasses.filter((value): value is SocialClass =>
      (SOCIAL_CLASSES as readonly string[]).includes(value),
    ),
    notes: row.notes ?? "",
  };
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  name: "",
  logoUrl: null,
  website: "",
  instagram: "",
  facebook: "",
  linkedin: "",
  youtube: "",
  ageMin: AGE_MIN,
  ageMax: AGE_MAX,
  genders: [],
  socialClasses: [],
  notes: "",
};
