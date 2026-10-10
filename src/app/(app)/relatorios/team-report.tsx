import Link from "next/link";

import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { formatDays, formatRate } from "@/lib/reports";
import { resolveMediaUrl } from "@/server/media";
import type { PersonReportRow } from "@/server/reports";
import { ExportCsvButton } from "./export-csv";
import type { ReportParams } from "./params";
import { EmptyNote, Section } from "./report-ui";

/** Por funcionário: carga atual, entregas no período e participação nas conversas. */
export function TeamReport({ rows, params }: { rows: PersonReportRow[]; params: ReportParams }) {
  return (
    <Section
      title="Equipe"
      description="Pelos trabalhos em que cada pessoa está hoje (quem saiu de um trabalho não leva o histórico dele). Mensagens: as que a pessoa mandou nos trabalhos no período."
      actions={
        <ExportCsvButton
          filename={`equipe-${params.period.from}-a-${params.period.to}`}
          rows={[
            ["Pessoa", "Em aberto", "Atrasados", "Concluídos", "No prazo", "Com atraso", "Entregues no prazo", "Tempo médio até concluir (dias)", "Mensagens"],
            ...rows.map((row) => [
              row.person.name,
              row.open,
              row.overdue,
              row.concluded,
              row.onTime,
              row.late,
              formatRate(row.onTimeRate),
              row.avgCycleDays === null ? "" : row.avgCycleDays.toFixed(1).replace(".", ","),
              row.messages,
            ]),
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyNote title="Ninguém na equipe ainda" />
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="text-right">Atrasados</TableHead>
                <TableHead className="text-right">Concluídos</TableHead>
                <TableHead className="text-right">No prazo</TableHead>
                <TableHead className="text-right">Tempo até concluir</TableHead>
                <TableHead className="text-right">Mensagens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.person.id}>
                  <TableCell>
                    {/* A planilha da pessoa (só admins veem a dos outros, e este relatório é de admins). */}
                    <Link
                      href={`/minha-planilha?pessoa=${row.person.id}`}
                      className="flex max-w-56 items-center gap-2 font-medium outline-none hover:underline focus-visible:underline"
                    >
                      <UserAvatar name={row.person.name} imageUrl={resolveMediaUrl(row.person.image)} className="size-7 text-[10px]" />
                      <span className="truncate">{row.person.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.open}</TableCell>
                  <TableCell className={row.overdue > 0 ? "text-right font-medium text-destructive-ink tabular-nums" : "text-right tabular-nums"}>
                    {row.overdue}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.concluded}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRate(row.onTimeRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDays(row.avgCycleDays)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.messages}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Section>
  );
}
