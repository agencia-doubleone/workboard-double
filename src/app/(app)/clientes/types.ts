import type { ClientLink, Gender, SocialClass } from "@/lib/clients";

// Formas já serializáveis que as páginas de clientes entregam aos client components.

export type ClientLinkItem = { key: ClientLink; url: string };

export type ClientRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  /** Redes sociais preenchidas (sem o site, que aparece sob o nome). */
  socials: ClientLinkItem[];
  audience: string;
  credentialCount: number;
  updated: { relative: string; absolute: string };
};

export type ClientFormValues = {
  clientId?: string;
  slug?: string;
  name: string;
  logoUrl: string | null;
  website: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  youtube: string;
  ageMin: number;
  ageMax: number;
  genders: Gender[];
  socialClasses: SocialClass[];
  notes: string;
};

export type CredentialRow = {
  id: string;
  service: string;
  url: string | null;
  username: string | null;
  hasNotes: boolean;
  updated: string;
};
