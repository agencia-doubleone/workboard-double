// Formas serializáveis que as páginas de planejamentos entregam aos client components.

import type { PlanningStatus, PostKind, PostScene, PostSlide, SocialNetwork } from "@/lib/planning";

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
  kind: PostKind;
  headline: string;
  supportText: string | null;
  copy: string;
  cta: string | null;
  hashtags: string[];
  slides: PostSlide[];
  scenes: PostScene[];
  /** Observações dos posts do formato antigo. */
  notes: string | null;
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
  /** O texto colado do Word, dos meses importados antes do JSON (só leitura). */
  document: string | null;
};
