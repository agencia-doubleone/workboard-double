import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { Stat } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate, formatDate } from "@/lib/format";
import { formatDays, formatRate } from "@/lib/reports";
import { resolveMediaUrl } from "@/server/media";
import {
  byClient,
  clientJobs,
  concludedDay,
  deliveryOutcome,
  isConcludedIn,
  isOverdueNow,
  periodBounds,
  summarize,
  type ReportJob,
} from "@/server/reports";
import { ExportCsvButton } from "./export-csv";
import { reportHref, type ReportParams } from "./params";
import { dueCell, EmptyNote, ReportJobsTable, Section, StatGrid } from "./report-ui";

type Props = { jobs: ReportJob[]; params: ReportParams; today: string };

/** Por cliente: o ranking de todos ou, com `cliente`, o detalhe de um. */
export function ClientsReport(props: Props) {
  return props.params.clientId ? <ClientDetail {...props} clientId={props.params.clientId} /> : <ClientsTable {...props} />;
}

function ClientsTable({ jobs, params, today }: Props) {
  const rows = byClient(jobs, periodBounds(params.period), today);
  return (
    <Section
      title="Clientes"
      description="Os que tiveram trabalho criado ou concluído no período, ou têm trabalho em aberto. Clique para ver os trabalhos de cada um."
      actions={
        <ExportCsvButton
          filename={`clientes-${params.period.from}-a-${params.period.to}`}
          rows={[
            ["Cliente", "Criados", "Concluídos", "No prazo", "Com atraso", "Entregues no prazo", "Tempo médio até concluir (dias)", "Em aberto", "Atrasados"],
            ...rows.map((row) => [
              row.client.name,
              row.created,
              row.concluded,
              row.onTime,
              row.late,
              formatRate(row.onTimeRate),
              row.avgCycleDays === null ? "" : row.avgCycleDays.toFixed(1).replace(".", ","),
              row.open,
              row.overdue,
            ]),
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyNote title="Nenhum cliente com movimento" description="Escolha outro período." />
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Criados</TableHead>
                <TableHead className="text-right">Concluídos</TableHead>
                <TableHead className="text-right">No prazo</TableHead>
                <TableHead className="text-right">Tempo até concluir</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="text-right">Atrasados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.client.id}>
                  <TableCell>
                    <Link
                      href={reportHref({ ...params, clientId: row.client.id })}
                      className="flex max-w-64 items-center gap-2 font-medium outline-none hover:underline focus-visible:underline"
                    >
                      <ClientLogo
                        name={row.client.name}
                        logoUrl={resolveMediaUrl(row.client.logoKey)}
                        className="size-6 text-[9px]"
                      />
                      <span className="truncate">{row.client.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.created}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.concluded}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRate(row.onTimeRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDays(row.avgCycleDays)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.open}</TableCell>
                  <TableCell className={row.overdue > 0 ? "text-right font-medium text-destructive-ink tabular-nums" : "text-right tabular-nums"}>
                    {row.overdue}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Section>
  );
}

function outcomeOf(item: ReportJob, bounds: ReturnType<typeof periodBounds>, today: string) {
  if (isConcludedIn(item, bounds) || item.status.isFinal) {
    const outcome = deliveryOutcome(item);
    return outcome === "on-time" ? "No prazo" : outcome === "late" ? "Com atraso" : "Sem data de entrega";
  }
  if (!item.active) return "Inativo";
  return isOverdueNow(item, today) ? "Atrasado" : "Em aberto";
}

function ClientDetail({ jobs, params, today, clientId }: Props & { clientId: string }) {
  const bounds = periodBounds(params.period);
  const all = jobs.filter((item) => item.client.id === clientId);
  const back = (
    <Link
      href={reportHref({ ...params, clientId: undefined })}
      className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline print:hidden"
    >
      <ArrowLeftIcon className="size-4" />
      Todos os clientes
    </Link>
  );
  if (all.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyNote title="Esse cliente ainda não tem trabalhos" />
      </div>
    );
  }
  const current = all[0].client;
  const summary = summarize(all, bounds, today);
  const list = clientJobs(jobs, clientId, bounds);

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex items-center gap-3">
        <ClientLogo name={current.name} logoUrl={resolveMediaUrl(current.logoKey)} className="size-10 text-xs" />
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{current.name}</h2>
          <Link
            href={`/clientes/${current.slug}`}
            className="w-fit text-xs text-muted-foreground outline-none hover:underline focus-visible:underline print:hidden"
          >
            Abrir a página do cliente
          </Link>
        </div>
      </div>
      <StatGrid>
        <Stat label="Criados" value={summary.created} detail="no período" />
        <Stat label="Concluídos" value={summary.concluded} detail="no período" />
        <Stat label="Entregues no prazo" value={formatRate(summary.onTimeRate)} detail={summary.onTime + summary.late > 0 ? `${summary.onTime} de ${summary.onTime + summary.late} com data` : "nenhum com data"} />
        <Stat label="Tempo até concluir" value={formatDays(summary.avgCycleDays)} detail="média" />
        <Stat label="Em aberto" value={summary.open} detail="agora" />
        <Stat label="Atrasados" value={summary.overdue} detail="agora" tone={summary.overdue > 0 ? "bad" : undefined} />
      </StatGrid>
      <Section
        title="Trabalhos"
        description="Criados ou concluídos no período, e os que seguem em aberto."
        actions={
          <ExportCsvButton
            filename={`${current.slug}-${params.period.from}-a-${params.period.to}`}
            rows={[
              ["PIT", "Trabalho", "Status", "Criado em", "Entrega", "Concluído em", "Situação", "Funcionários"],
              ...list.map((item) => [
                item.pit,
                item.name,
                item.status.name,
                formatDate(item.createdAt),
                item.dueDate ? formatCalendarDate(item.dueDate) : "",
                item.status.isFinal ? formatCalendarDate(concludedDay(item)) : "",
                outcomeOf(item, bounds, today),
                item.assignees.map((person) => person.name).join(", "),
              ]),
            ]}
          />
        }
      >
        {list.length === 0 ? (
          <EmptyNote title="Nada no período" description="Nenhum trabalho criado, concluído ou em aberto." />
        ) : (
          <ReportJobsTable
            jobs={list}
            showClient={false}
            columns={[
              { header: "Criado em", cell: (item) => formatDate(item.createdAt), className: "tabular-nums" },
              { header: "Entrega", cell: dueCell, className: "tabular-nums" },
              {
                header: "Concluído em",
                cell: (item) => (item.status.isFinal ? formatCalendarDate(concludedDay(item)) : "—"),
                className: "tabular-nums",
              },
              {
                header: "Situação",
                cell: (item) => {
                  const label = outcomeOf(item, bounds, today);
                  const variant =
                    label === "No prazo" ? "success" : label === "Com atraso" || label === "Atrasado" ? "destructive" : "outline";
                  return <Badge variant={variant}>{label}</Badge>;
                },
              },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
