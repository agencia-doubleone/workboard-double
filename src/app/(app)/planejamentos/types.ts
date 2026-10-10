// Formas serializáveis que as páginas de planejamentos entregam aos client components.

import type { PlanningStatus, PostFormatKind, PostSection, SocialNetwork } from "@/lib/planning";

export type PlanningPersonView = { id: string; name: string; imageUrl: string | null };

export type PlanningFormValues = {
  planningId?: string;
  clientId: string | null;
  networks: SocialNetwork[];
  /** Texto do campo (vira número ao salvar). */
  postsPerMonth: string;
  overview: string;
  memberIds: string[];
};

export type PostView = {
  id: string;
  /** "AAAA-MM-DD" */
  date: string | null;
  /** "qua 02/09" */
  dateLabel: string | null;
  network: SocialNetwork | null;
  format: string | null;
  formatKind: PostFormatKind;
  topic: string | null;
  headline: string;
  copy: string;
  sections: PostSection[];
  status: PlanningStatus;
};

export type MonthView = {
  /** "AAAA-MM" */
  month: string;
  /** "setembro de 2026" */
  label: string;
  /** O mês já foi começado (tem linha no banco). */
  started: boolean;
  status: PlanningStatus;
  concept: string | null;
  document: string | null;
};
