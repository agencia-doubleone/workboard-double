import { JobStatusBadge } from "@/components/job-status-badge";
import { formatCalendarDate } from "@/lib/format";
import { formatDays, STALLED_AFTER_DAYS } from "@/lib/reports";
import type { ReportJob, StageRow } from "@/server/reports";
import { ExportCsvButton } from "./export-csv";
import type { ReportParams } from "./params";
import { BarList, dueCell, EmptyNote, ReportJobsTable, Section } from "./report-ui";

/** Etapas: onde o fluxo demora (pelo histórico) e o que está parado agora. */
export function StagesReport({
  stages,
  concludedCount,
  stalled,
  params,
  today,
}: {
  stages: StageRow[];
  concludedCount: number;
  stalled: { job: ReportJob; days: number }[];
  params: ReportParams;
  today: string;
}) {
  const daysOf = new Map(stalled.map((entry) => [entry.job.id, entry.days]));
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Tempo médio em cada etapa"
        description={`Dos ${concludedCount} trabalhos concluídos no período: quanto tempo, em média, ficaram em cada status até concluir. As etapas mais longas são onde o fluxo trava.`}
        actions={
          <ExportCsvButton
            filename={`etapas-${params.period.from}-a-${params.period.to}`}
            rows={[
              ["Etapa", "Trabalhos que passaram", "Tempo médio (dias)"],
              ...stages.map((stage) => [stage.name, stage.jobs, stage.avgDays.toFixed(1).replace(".", ",")]),
            ]}
          />
        }
      >
        <BarList
          empty="Nenhum trabalho concluído no período (ou sem histórico de status)."
          items={stages.map((stage) => ({
            key: stage.name,
            label: (
              <span className="flex items-center gap-2">
                <JobStatusBadge name={stage.name} textColor={stage.textColor} backgroundColor={stage.backgroundColor} />
                <span className="text-xs text-muted-foreground">
                  {stage.jobs} {stage.jobs === 1 ? "trabalho" : "trabalhos"}
                </span>
              </span>
            ),
            value: stage.avgDays,
            display: formatDays(stage.avgDays),
            color: stage.textColor,
          }))}
        />
      </Section>

      <Section
        title={`Parados há ${STALLED_AFTER_DAYS} dias ou mais`}
        description="Em aberto e sem mudar de status há muito tempo, do mais parado para o menos."
        actions={
          <ExportCsvButton
            filename={`parados-${today}`}
            rows={[
              ["PIT", "Trabalho", "Cliente", "Status", "Parado há (dias)", "Entrega", "Funcionários"],
              ...stalled.map((entry) => [
                entry.job.pit,
                entry.job.name,
                entry.job.client.name,
                entry.job.status.name,
                Math.floor(entry.days),
                entry.job.dueDate ? formatCalendarDate(entry.job.dueDate) : "",
                entry.job.assignees.map((person) => person.name).join(", "),
              ]),
            ]}
          />
        }
      >
        {stalled.length === 0 ? (
          <EmptyNote title="Nenhum trabalho parado" description="Todos os trabalhos em aberto mudaram de status recentemente." />
        ) : (
          <ReportJobsTable
            jobs={stalled.map((entry) => entry.job)}
            columns={[
              {
                header: "Parado há",
                cell: (item) => <span className="font-medium">{formatDays(Math.floor(daysOf.get(item.id) ?? 0))}</span>,
                className: "tabular-nums",
              },
              { header: "Entrega", cell: dueCell, className: "tabular-nums" },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
