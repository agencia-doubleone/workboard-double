import { formatCalendarDate, formatDate } from "@/lib/format";
import { UPCOMING_DAYS } from "@/lib/reports";
import { concludedDay, deadlines, periodBounds, type ReportJob } from "@/server/reports";
import { ExportCsvButton } from "./export-csv";
import type { ReportParams } from "./params";
import { dueCell, EmptyNote, ReportJobsTable, Section } from "./report-ui";

const plural = (days: number, one: string, many: string) => `${days} ${days === 1 ? one : many}`;

const csvBase = (item: ReportJob) => [
  item.pit,
  item.name,
  item.client.name,
  item.status.name,
  item.dueDate ? formatCalendarDate(item.dueDate) : "",
];
const CSV_HEADER = ["PIT", "Trabalho", "Cliente", "Status", "Entrega"];
const people = (item: ReportJob) => item.assignees.map((person) => person.name).join(", ");

/** Prazos: o que está atrasado e o que vence logo (agora), e o que atrasou no período. */
export function DeadlinesReport({ jobs, params, today }: { jobs: ReportJob[]; params: ReportParams; today: string }) {
  const due = deadlines(jobs, periodBounds(params.period), today);
  const daysOf = new Map<string, number>();
  for (const entry of [...due.overdue, ...due.upcoming]) daysOf.set(entry.job.id, entry.days);
  const lateBy = new Map(due.concludedLate.map((entry) => [entry.job.id, entry.days]));

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Atrasados agora"
        description="Em aberto com a entrega já passada, do mais atrasado para o menos."
        actions={
          <ExportCsvButton
            filename={`atrasados-${today}`}
            rows={[
              [...CSV_HEADER, "Dias de atraso", "Funcionários"],
              ...due.overdue.map((entry) => [...csvBase(entry.job), entry.days, people(entry.job)]),
            ]}
          />
        }
      >
        {due.overdue.length === 0 ? (
          <EmptyNote title="Nenhum trabalho atrasado" description="Tudo em dia por aqui." />
        ) : (
          <ReportJobsTable
            jobs={due.overdue.map((entry) => entry.job)}
            columns={[
              { header: "Entrega", cell: dueCell, className: "tabular-nums" },
              {
                header: "Atraso",
                cell: (item) => (
                  <span className="font-medium text-destructive-ink">{plural(daysOf.get(item.id) ?? 0, "dia", "dias")}</span>
                ),
                className: "tabular-nums",
              },
            ]}
          />
        )}
      </Section>

      <Section
        title={`Vencem nos próximos ${UPCOMING_DAYS} dias`}
        description="Em aberto, com a entrega entre hoje e a próxima semana."
        actions={
          <ExportCsvButton
            filename={`vencem-em-breve-${today}`}
            rows={[
              [...CSV_HEADER, "Faltam (dias)", "Funcionários"],
              ...due.upcoming.map((entry) => [...csvBase(entry.job), entry.days, people(entry.job)]),
            ]}
          />
        }
      >
        {due.upcoming.length === 0 ? (
          <EmptyNote title="Nenhuma entrega nos próximos dias" />
        ) : (
          <ReportJobsTable
            jobs={due.upcoming.map((entry) => entry.job)}
            columns={[
              { header: "Entrega", cell: dueCell, className: "tabular-nums" },
              {
                header: "Faltam",
                cell: (item) => {
                  const days = daysOf.get(item.id) ?? 0;
                  return days === 0 ? <span className="font-medium text-warning-ink">Hoje</span> : plural(days, "dia", "dias");
                },
                className: "tabular-nums",
              },
            ]}
          />
        )}
      </Section>

      <Section
        title="Concluídos com atraso"
        description="Concluídos no período depois da data de entrega."
        actions={
          <ExportCsvButton
            filename={`concluidos-com-atraso-${params.period.from}-a-${params.period.to}`}
            rows={[
              [...CSV_HEADER, "Concluído em", "Dias de atraso", "Funcionários"],
              ...due.concludedLate.map((entry) => [
                ...csvBase(entry.job),
                formatCalendarDate(concludedDay(entry.job)),
                entry.days,
                people(entry.job),
              ]),
            ]}
          />
        }
      >
        {due.concludedLate.length === 0 ? (
          <EmptyNote title="Nada concluído com atraso no período" />
        ) : (
          <ReportJobsTable
            jobs={due.concludedLate.map((entry) => entry.job)}
            columns={[
              { header: "Entrega", cell: dueCell, className: "tabular-nums" },
              { header: "Concluído em", cell: (item) => formatCalendarDate(concludedDay(item)), className: "tabular-nums" },
              { header: "Atraso", cell: (item) => plural(lateBy.get(item.id) ?? 0, "dia", "dias"), className: "tabular-nums" },
            ]}
          />
        )}
      </Section>

      <Section
        title="Em aberto sem data de entrega"
        description="Sem data, eles não aparecem no calendário nem contam nos prazos."
        actions={
          <ExportCsvButton
            filename={`sem-data-de-entrega-${today}`}
            rows={[
              ["PIT", "Trabalho", "Cliente", "Status", "Criado em", "Funcionários"],
              ...due.noDueDate.map((item) => [
                item.pit,
                item.name,
                item.client.name,
                item.status.name,
                formatDate(item.createdAt),
                people(item),
              ]),
            ]}
          />
        }
      >
        {due.noDueDate.length === 0 ? (
          <EmptyNote title="Todos os trabalhos em aberto têm data de entrega" />
        ) : (
          <ReportJobsTable
            jobs={due.noDueDate}
            columns={[{ header: "Criado em", cell: (item) => formatDate(item.createdAt), className: "tabular-nums" }]}
          />
        )}
      </Section>
    </div>
  );
}
