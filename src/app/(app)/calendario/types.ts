// Formas serializáveis que a página do calendário entrega aos client components.

import type { JobPersonView } from "../trabalhos/types";

export type CalendarJob = {
  kind: "job";
  id: string;
  pit: number;
  name: string;
  clientName: string;
  clientLogoUrl: string | null;
  status: { name: string; textColor: string; backgroundColor: string };
  /** Encerrado (status final) ou inativo: aparece apagado. */
  done: boolean;
  /** Entrega já passou e o trabalho segue em aberto. */
  overdue: boolean;
  assignees: JobPersonView[];
};

export type CalendarBirthday = {
  kind: "birthday";
  id: string;
  name: string;
  imageUrl: string | null;
  isViewer: boolean;
};

/** Fundação ou data importante de um cliente ativo. */
export type CalendarClientDate = {
  kind: "client";
  id: string;
  clientName: string;
  clientSlug: string;
  clientLogoUrl: string | null;
  /** "Aniversário da empresa", "Fundação" ou o nome da data. */
  label: string;
  /** Anos completados (só o aniversário da empresa). */
  age: string | null;
  founding: boolean;
};

export type CalendarItem = CalendarJob | CalendarBirthday | CalendarClientDate;

export type CalendarDay = {
  /** "AAAA-MM-DD" */
  date: string;
  /** Número do dia ("9"). */
  label: string;
  /** "sexta-feira, 9 de outubro" */
  title: string;
  /** "sex., 9 de out." (agenda do celular). */
  shortTitle: string;
  inMonth: boolean;
  isToday: boolean;
  /** Aniversários da equipe, datas dos clientes e os trabalhos por PIT. */
  items: CalendarItem[];
};
