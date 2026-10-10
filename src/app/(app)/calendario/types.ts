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

export type CalendarItem = CalendarJob | CalendarBirthday;

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
  /** Aniversários primeiro, depois os trabalhos por PIT. */
  items: CalendarItem[];
};
