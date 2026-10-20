import { NotebookPenIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ClientLogo } from "@/components/client-logo";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { db } from "@/db";
import { isMonthKey, monthOf } from "@/lib/calendar";
import { todayInSaoPaulo } from "@/lib/jobs";
import { defaultPlanningMonth, PLANNING_STATUSES, PLANNING_STATUS_KEYS } from "@/lib/planning";
import { requireSession } from "@/lib/session";
import { resolveMediaUrl } from "@/server/media";
import { listPlanningsForMonth } from "@/server/planning";
import { CopyPromptButton } from "./copy-prompt-button";
import { ApprovalProgress, MonthNav, NetworkIcon, PlanningStatusBadge } from "./planning-ui";

export const metadata: Metadata = { title: "Planejamentos" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Visão do mês: todos os clientes com planejamento, o status do mês de cada um e
// quantos posts já foram aprovados. Toda a equipe vê e edita.
export default function PlanejamentosPage({ searchParams }: PageProps<"/planejamentos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanningList searchParams={searchParams} />
    </Suspense>
  );
}

async function PlanningList({ searchParams }: { searchParams: PageProps<"/planejamentos">["searchParams"] }) {
  await requireSession();
  const today = todayInSaoPaulo();
  const current = monthOf(today);
  // Sem ?mes=, abre o mês que vem (o que a equipe está planejando).
  const standard = defaultPlanningMonth(today);
  const requested = first((await searchParams).mes);
  const month = isMonthKey(requested) ? requested : standard;
  const rows = await listPlanningsForMonth(db, month);
  const hrefFor = (target: string) => (target === standard ? "/planejamentos" : `/planejamentos?mes=${target}`);

  const counts = Object.fromEntries(PLANNING_STATUS_KEYS.map((status) => [status, 0])) as Record<string, number>;
  let notStarted = 0;
  for (const row of rows) {
    if (row.monthStatus) counts[row.monthStatus]++;
    else notStarted++;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Planejamentos"
        description="Conteúdo de redes sociais dos clientes, mês a mês: do texto à aprovação."
        actions={
          <>
            <CopyPromptButton month={month} />
            <Link href="/planejamentos/novo" className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Novo planejamento
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNav month={month} current={current} hrefFor={hrefFor} />
          {rows.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {notStarted > 0 && <span>{notStarted} não começados</span>}
              {PLANNING_STATUS_KEYS.filter((status) => counts[status] > 0).map((status) => (
                <span key={status}>
                  {counts[status]} {PLANNING_STATUSES[status].label.toLowerCase()}
                </span>
              ))}
            </p>
          )}
        </div>

        {rows.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <NotebookPenIcon />
              </EmptyMedia>
              <EmptyTitle>Nenhum planejamento ainda</EmptyTitle>
              <EmptyDescription>
                Crie o planejamento de um cliente para organizar os posts de cada mês e acompanhar a aprovação.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/planejamentos/novo" className={buttonVariants({ variant: "soft" })}>
                <PlusIcon data-icon="inline-start" />
                Novo planejamento
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status do mês</TableHead>
                  <TableHead>Posts</TableHead>
                  <TableHead>Ajustes</TableHead>
                  <TableHead>Redes</TableHead>
                  <TableHead>Responsáveis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/planejamentos/${row.client.slug}${month === standard ? "" : `?mes=${month}`}`}
                        className="flex max-w-64 items-center gap-2.5 font-medium outline-none hover:underline focus-visible:underline"
                      >
                        <ClientLogo name={row.client.name} logoUrl={resolveMediaUrl(row.client.logoKey)} className="size-7 text-[10px]" />
                        <span className="truncate">{row.client.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {row.monthStatus ? (
                        <PlanningStatusBadge status={row.monthStatus} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Não começado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ApprovalProgress approved={row.posts.approved} total={row.posts.total} goal={row.postsPerMonth} />
                    </TableCell>
                    <TableCell>
                      {row.posts.adjustments > 0 ? (
                        <span className="text-sm font-medium text-destructive-ink tabular-nums">{row.posts.adjustments}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {row.networks.length === 0 ? "—" : row.networks.map((network) => <NetworkIcon key={network} network={network} />)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.members.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="flex -space-x-1.5">
                          {row.members.slice(0, 4).map((person) => (
                            <UserAvatar
                              key={person.id}
                              name={person.name}
                              imageUrl={resolveMediaUrl(person.image)}
                              alt={person.name}
                              className="size-6 text-[9px] ring-2 ring-card"
                            />
                          ))}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </div>
  );
}
