import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { formatMonth, monthOf } from "@/lib/calendar";
import { PLANNING_STATUSES, PLANNING_STATUS_KEYS } from "@/lib/planning";
import { formatRate } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/server/media";
import type { PlanningPerson } from "@/server/planning";
import {
  lateMonths,
  planningByClient,
  planningByMonth,
  planningByPerson,
  planningStatusCounts,
  postsApproved,
  postTotal,
  summarizePlannings,
  type PlanningReportEntry,
} from "@/server/planning-reports";
import { ApprovalProgress, PlanningStatusBadge } from "../planejamentos/planning-ui";
import { ExportCsvButton } from "./export-csv";
import { BarList, EmptyNote, Section, Stat, StatGrid } from "./report-ui";

type Props = { entries: PlanningReportEntry[]; months: string[]; today: string };

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** Planejamentos: posts e aprovação nos meses do período, por cliente e por responsável. */
export function PlanningReport({ entries, months, today }: Props) {
  const currentMonth = monthOf(today);
  if (entries.length === 0) {
    return (
      <EmptyNote
        title="Nenhum planejamento nesses meses"
        description="Os planejamentos aparecem aqui a partir do mês em que foram criados."
      />
    );
  }

  const summary = summarizePlannings(entries, currentMonth);
  const clients = planningByClient(entries, currentMonth);
  const people = planningByPerson(entries, currentMonth);
  const late = lateMonths(entries, currentMonth);
  const statuses = planningStatusCounts(entries);
  const single = months.length === 1;
  const filename = (name: string) => `${name}-${months[0]}${single ? "" : `-a-${months[months.length - 1]}`}`;
  const planningHref = (slug: string, month?: string) =>
    `/planejamentos/${slug}${month && month !== currentMonth ? `?mes=${month}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <StatGrid>
        <Stat label="Posts" value={summary.posts} detail={summary.goalMonths > 0 ? `meta de ${summary.goal}` : "nos meses do período"} />
        <Stat
          label="Posts aprovados"
          value={formatRate(rate(summary.approved, summary.posts))}
          detail={`${summary.approved} de ${summary.posts}`}
        />
        <Stat
          label="Em ajustes"
          value={summary.adjustments}
          detail="posts, agora"
          tone={summary.adjustments > 0 ? "bad" : undefined}
        />
        <Stat
          label="Meses aprovados"
          value={summary.approvedMonths}
          detail={`de ${summary.months} · ${summary.finalized} ${summary.finalized === 1 ? "finalizado" : "finalizados"}`}
        />
        <Stat
          label="Meta de posts"
          value={formatRate(rate(summary.goalReached, summary.goalMonths))}
          detail={summary.goalMonths > 0 ? `${summary.goalReached} de ${summary.goalMonths} meses na meta` : "nenhum com meta"}
        />
        <Stat label="Atrasados" value={summary.late} detail="mês começou sem aprovação" tone={summary.late > 0 ? "bad" : undefined} />
      </StatGrid>

      {!single && <MonthsSection entries={entries} months={months} currentMonth={currentMonth} filename={filename("planejamentos-mes-a-mes")} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Status dos meses" description="O planejamento de cada cliente em cada mês.">
          <BarList
            empty="Nenhum mês."
            items={[
              ...PLANNING_STATUS_KEYS.filter((status) => statuses.months[status] > 0).map((status) => ({
                key: status,
                label: <PlanningStatusBadge status={status} />,
                value: statuses.months[status],
              })),
              ...(statuses.notStarted > 0
                ? [{ key: "nao-comecado", label: <span className="text-muted-foreground">Não começado</span>, value: statuses.notStarted }]
                : []),
            ]}
          />
        </Section>
        <Section title="Status dos posts" description="Os posts desses meses, agora.">
          <BarList
            empty="Nenhum post nesses meses."
            items={PLANNING_STATUS_KEYS.filter((status) => statuses.posts[status] > 0).map((status) => ({
              key: status,
              label: <PlanningStatusBadge status={status} />,
              value: statuses.posts[status],
            }))}
          />
        </Section>
      </div>

      <Section
        title="Atrasados"
        description="O mês já começou e o planejamento não está aprovado nem finalizado."
        actions={
          <ExportCsvButton
            filename={filename("planejamentos-atrasados")}
            rows={[
              ["Cliente", "Mês", "Status", "Posts", "Aprovados", "Meta", "Responsáveis"],
              ...late.map((entry) => [
                entry.client.name,
                formatMonth(entry.month),
                entry.status ? PLANNING_STATUSES[entry.status].label : "Não começado",
                postTotal(entry),
                postsApproved(entry),
                entry.goal ?? "",
                entry.members.map((person) => person.name).join(", "),
              ]),
            ]}
          />
        }
      >
        {late.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum mês atrasado.</p>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  {!single && <TableHead>Mês</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Posts</TableHead>
                  <TableHead>Responsáveis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {late.map((entry) => (
                  <TableRow key={`${entry.planningId}:${entry.month}`}>
                    <TableCell>
                      <ClientLink client={entry.client} href={planningHref(entry.client.slug, entry.month)} />
                    </TableCell>
                    {!single && <TableCell className="first-letter:uppercase">{formatMonth(entry.month)}</TableCell>}
                    <TableCell>
                      {entry.status ? (
                        <PlanningStatusBadge status={entry.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Não começado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ApprovalProgress approved={postsApproved(entry)} total={postTotal(entry)} goal={entry.goal} />
                    </TableCell>
                    <TableCell>
                      <People people={entry.members} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </Section>

      <Section
        title="Por cliente"
        description={single ? "O planejamento de cada cliente no mês." : "Somando os meses do período."}
        actions={
          <ExportCsvButton
            filename={filename("planejamentos-clientes")}
            rows={[
              [
                "Cliente",
                single ? "Status do mês" : "Meses aprovados",
                "Meses",
                "Posts",
                "Aprovados",
                "Meta",
                "Em ajustes",
                "Atrasados",
                "Responsáveis",
              ],
              ...clients.map((row) => [
                row.client.name,
                single ? (row.entries[0].status ? PLANNING_STATUSES[row.entries[0].status].label : "Não começado") : row.approvedMonths,
                row.months,
                row.posts,
                row.approved,
                row.goalMonths > 0 ? row.goal : "",
                row.adjustments,
                row.late,
                row.members.map((person) => person.name).join(", "),
              ]),
            ]}
          />
        }
      >
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>{single ? "Status do mês" : "Meses aprovados"}</TableHead>
                <TableHead>Posts</TableHead>
                <TableHead className="text-right">Em ajustes</TableHead>
                <TableHead className="text-right">Atrasados</TableHead>
                <TableHead>Responsáveis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((row) => (
                <TableRow key={row.planningId}>
                  <TableCell>
                    <ClientLink client={row.client} href={planningHref(row.client.slug, single ? months[0] : undefined)} />
                  </TableCell>
                  <TableCell>
                    {single ? (
                      row.entries[0].status ? (
                        <PlanningStatusBadge status={row.entries[0].status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Não começado</span>
                      )
                    ) : (
                      <span className="tabular-nums">
                        {row.approvedMonths} de {row.months}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ApprovalProgress approved={row.approved} total={row.posts} goal={row.goalMonths > 0 ? row.goal : null} />
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", row.adjustments > 0 && "font-medium text-destructive-ink")}>
                    {row.adjustments}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", row.late > 0 && "font-medium text-destructive-ink")}>
                    {row.late}
                  </TableCell>
                  <TableCell>
                    <People people={row.members} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Section>

      <Section
        title="Por responsável"
        description="Pelos planejamentos em que cada pessoa é responsável hoje (quem saiu de um planejamento não leva o histórico dele)."
        actions={
          <ExportCsvButton
            filename={filename("planejamentos-responsaveis")}
            rows={[
              ["Pessoa", "Planejamentos", "Meses", "Meses aprovados", "Posts", "Aprovados", "Posts aprovados", "Em ajustes", "Atrasados"],
              ...people.map((row) => [
                row.person.name,
                row.clients,
                row.months,
                row.approvedMonths,
                row.posts,
                row.approved,
                formatRate(rate(row.approved, row.posts)),
                row.adjustments,
                row.late,
              ]),
            ]}
          />
        }
      >
        {people.length === 0 ? (
          <EmptyNote title="Nenhum responsável" description="Escolha os responsáveis em “Editar planejamento”." />
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead className="text-right">Planejamentos</TableHead>
                  <TableHead className="text-right">Meses aprovados</TableHead>
                  <TableHead className="text-right">Posts</TableHead>
                  <TableHead className="text-right">Posts aprovados</TableHead>
                  <TableHead className="text-right">Em ajustes</TableHead>
                  <TableHead className="text-right">Atrasados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((row) => (
                  <TableRow key={row.person.id}>
                    <TableCell>
                      <span className="flex max-w-64 items-center gap-2 font-medium">
                        <UserAvatar name={row.person.name} imageUrl={resolveMediaUrl(row.person.image)} className="size-6 text-[9px]" />
                        <span className="truncate">{row.person.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.clients}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.approvedMonths} de {row.months}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.posts}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRate(rate(row.approved, row.posts))}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", row.adjustments > 0 && "font-medium text-destructive-ink")}>
                      {row.adjustments}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", row.late > 0 && "font-medium text-destructive-ink")}>
                      {row.late}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </Section>
    </div>
  );
}

/** Mês a mês (períodos de mais de um mês). */
function MonthsSection({
  entries,
  months,
  currentMonth,
  filename,
}: {
  entries: PlanningReportEntry[];
  months: string[];
  currentMonth: string;
  filename: string;
}) {
  const rows = planningByMonth(entries, months, currentMonth);
  return (
    <Section
      title="Mês a mês"
      description="Posts aprovados de cada mês, com a meta somada dos clientes."
      actions={
        <ExportCsvButton
          filename={filename}
          rows={[
            ["Mês", "Clientes", "Meses aprovados", "Finalizados", "Posts", "Aprovados", "Meta", "Em ajustes", "Atrasados"],
            ...rows.map((row) => [
              formatMonth(row.month),
              row.months,
              row.approvedMonths,
              row.finalized,
              row.posts,
              row.approved,
              row.goalMonths > 0 ? row.goal : "",
              row.adjustments,
              row.late,
            ]),
          ]}
        />
      }
    >
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead className="text-right">Meses aprovados</TableHead>
              <TableHead className="text-right">Em ajustes</TableHead>
              <TableHead className="text-right">Atrasados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.month}>
                <TableCell className="font-medium first-letter:uppercase">{formatMonth(row.month)}</TableCell>
                <TableCell>
                  <ApprovalProgress approved={row.approved} total={row.posts} goal={row.goalMonths > 0 ? row.goal : null} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.approvedMonths} de {row.months}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", row.adjustments > 0 && "font-medium text-destructive-ink")}>
                  {row.adjustments}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", row.late > 0 && "font-medium text-destructive-ink")}>
                  {row.late}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Section>
  );
}

function ClientLink({ client, href }: { client: PlanningReportEntry["client"]; href: string }) {
  return (
    <Link href={href} className="flex max-w-64 items-center gap-2 font-medium outline-none hover:underline focus-visible:underline">
      <ClientLogo name={client.name} logoUrl={resolveMediaUrl(client.logoKey)} className="size-6 text-[9px]" />
      <span className="truncate">{client.name}</span>
    </Link>
  );
}

function People({ people }: { people: PlanningPerson[] }) {
  if (people.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex -space-x-1.5" title={people.map((person) => person.name).join(", ")}>
      {people.slice(0, 4).map((person) => (
        <UserAvatar
          key={person.id}
          name={person.name}
          imageUrl={resolveMediaUrl(person.image)}
          alt={person.name}
          className="size-6 text-[9px] ring-2 ring-card"
        />
      ))}
      {people.length > 4 && (
        <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[10px] font-medium ring-2 ring-card">
          +{people.length - 4}
        </span>
      )}
    </span>
  );
}
