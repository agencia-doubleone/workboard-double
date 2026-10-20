import { Stat } from "@/components/dashboard";
import { JobStatusBadge } from "@/components/job-status-badge";
import { formatCalendarDate } from "@/lib/format";
import { dayDiff, formatDays, formatRate } from "@/lib/reports";
import {
  byClient,
  byPerson,
  openByStatus,
  periodBounds,
  summarize,
  timeline,
  type ReportJob,
} from "@/server/reports";
import { ExportCsvButton } from "./export-csv";
import { reportHref, type ReportParams } from "./params";
import { BarList, countLabel, Section, shareLabel, StatGrid, TimelineChart } from "./report-ui";

const TOP = 6;

export function GeneralReport({ jobs, params, today }: { jobs: ReportJob[]; params: ReportParams; today: string }) {
  const bounds = periodBounds(params.period);
  const summary = summarize(jobs, bounds, today);
  const buckets = timeline(jobs, params.period);
  const monthly = dayDiff(params.period.from, params.period.to) > 92;
  const statuses = openByStatus(jobs);
  const openTotal = statuses.reduce((sum, row) => sum + row.count, 0);
  const clients = byClient(jobs, bounds, today).slice(0, TOP);
  // Quem aparece como funcionário em algum trabalho (o ranking completo fica na aba da equipe).
  const people = [...new Map(jobs.flatMap((item) => item.assignees).map((person) => [person.id, person])).values()];
  const team = byPerson(jobs, people, bounds, today, new Map())
    .filter((row) => row.concluded > 0)
    .slice(0, TOP);
  const withDue = summary.onTime + summary.late;

  return (
    <div className="flex flex-col gap-6">
      <StatGrid>
        <Stat label="Criados" value={summary.created} detail="no período" />
        <Stat label="Concluídos" value={summary.concluded} detail="no período" />
        <Stat
          label="Entregues no prazo"
          value={formatRate(summary.onTimeRate)}
          detail={withDue > 0 ? `${summary.onTime} de ${withDue} com data` : "nenhum com data"}
          tone={summary.onTimeRate === null ? undefined : summary.onTimeRate >= 0.8 ? "good" : summary.onTimeRate < 0.5 ? "bad" : undefined}
        />
        <Stat label="Tempo até concluir" value={formatDays(summary.avgCycleDays)} detail="média desde a criação" />
        <Stat label="Em aberto" value={summary.open} detail="agora" />
        <Stat label="Atrasados" value={summary.overdue} detail="agora" tone={summary.overdue > 0 ? "bad" : undefined} />
      </StatGrid>

      <Section
        title="Criados e concluídos"
        description={monthly ? "Por mês, no período." : "Por semana, no período."}
        actions={
          <ExportCsvButton
            filename={`criados-e-concluidos-${params.period.from}-a-${params.period.to}`}
            rows={[
              ["De", "Até", "Criados", "Concluídos"],
              ...buckets.map((bucket) => [
                formatCalendarDate(bucket.from),
                formatCalendarDate(bucket.to),
                bucket.created,
                bucket.concluded,
              ]),
            ]}
          />
        }
      >
        <TimelineChart buckets={buckets} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Em aberto por status" description="Agora, os ativos que ainda não foram encerrados.">
          <BarList
            empty="Nenhum trabalho em aberto."
            items={statuses.map(({ status, count }) => ({
              key: status.id,
              label: (
                <JobStatusBadge name={status.name} textColor={status.textColor} backgroundColor={status.backgroundColor} />
              ),
              value: count,
              neutral: true,
              hint: `${countLabel(count, "trabalho", "trabalhos")} · ${shareLabel(count, openTotal)}`,
            }))}
          />
        </Section>
        <Section title="Clientes com mais movimento" description="Trabalhos criados mais concluídos no período.">
          <BarList
            empty="Nenhum trabalho no período."
            items={clients
              .filter((row) => row.created + row.concluded > 0)
              .map((row) => ({
                key: row.client.id,
                label: row.client.name,
                value: row.created + row.concluded,
                hint: `${countLabel(row.created, "criado", "criados")} e ${countLabel(row.concluded, "concluído", "concluídos")}`,
                href: reportHref({ ...params, tab: "clientes", clientId: row.client.id }),
              }))}
          />
        </Section>
        <Section title="Quem mais concluiu" description="Trabalhos concluídos no período, por funcionário.">
          <BarList
            empty="Nenhum trabalho concluído no período."
            items={team.map((row) => ({
              key: row.person.id,
              label: row.person.name,
              value: row.concluded,
              hint: countLabel(row.concluded, "trabalho concluído", "trabalhos concluídos"),
              href: reportHref({ ...params, tab: "equipe", clientId: undefined }),
            }))}
          />
        </Section>
      </div>
    </div>
  );
}
