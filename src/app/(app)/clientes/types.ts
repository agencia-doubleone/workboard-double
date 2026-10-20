import type { ClientLink, Gender, SocialClass } from "@/lib/clients";
import type { PortalContactStatus } from "@/lib/portal";

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

/** Uma linha das datas importantes no formulário (key só para a lista do React). */
export type ClientDateDraft = { key: string; label: string; date: string; yearly: boolean };

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
  /** "AAAA-MM-DD" ou "" sem data. */
  foundedOn: string;
  dates: ClientDateDraft[];
};

export type CredentialRow = {
  id: string;
  service: string;
  url: string | null;
  username: string | null;
  hasNotes: boolean;
  updated: string;
};

/** Um acesso ao portal do cliente, para o card da página do cliente (só admins). */
export type PortalContactRow = {
  id: string;
  name: string;
  email: string;
  /** Foto que o contato pôs no portal (URL já resolvida), ou null. */
  imageUrl: string | null;
  status: PortalContactStatus;
  /** Aprova ou pede alterações nas entregas (sem isso, só acompanha). */
  canApprove: boolean;
  /** "há 2 dias" ou null (nunca entrou). */
  lastSignIn: string | null;
  /** "há 3 horas" ou null (nenhum convite mandado). */
  invited: string | null;
};
