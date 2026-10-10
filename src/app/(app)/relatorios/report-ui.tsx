import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { formatCalendarDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/server/media";
import type { ReportJob, TimelineBucket } from "@/server/reports";

// Blocos dos relatórios (componentes de servidor: as contas já vêm prontas).

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{children}</div>;
}

export function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-raised break-inside-avoid">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" && "text-success-ink",
          tone === "bad" && "text-destructive-ink",
        )}
      >
        {value}
      </span>
      {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("break-inside-avoid", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {actions && <CardAction className="flex items-center gap-2 print:hidden">{actions}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyNote({ title, description }: { title: string; description?: string }) {
  return (
    <Empty className="min-h-40 border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

export type BarItem = {
  key: string;
  label: React.ReactNode;
  value: number;
  /** Texto do valor (padrão: o número). */
  display?: string;
  /** Cor da barra (padrão: a de destaque). */
  color?: string;
  href?: string;
};

/** Barras horizontais proporcionais ao maior valor. */
export function BarList({ items, empty }: { items: BarItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => {
        const row = (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{item.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{item.display ?? item.value.toLocaleString("pt-BR")}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", !item.color && "bg-primary")}
                style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: item.color }}
              />
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className="flex flex-col gap-1.5 rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {row}
              </Link>
            ) : (
              <div className="flex flex-col gap-1.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Colunas lado a lado: criados (cinza) e concluídos (destaque) em cada semana ou mês. */
export function TimelineChart({ buckets }: { buckets: TimelineBucket[] }) {
  const max = Math.max(...buckets.flatMap((bucket) => [bucket.created, bucket.concluded]), 1);
  const showEvery = Math.ceil(buckets.length / 12);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-foreground/25" /> Criados
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Concluídos
        </span>
      </div>
      <div className="flex h-44 items-end gap-1 border-b sm:gap-2" aria-hidden="true">
        {buckets.map((bucket) => (
          <div
            key={bucket.from}
            className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
            title={`${formatCalendarDate(bucket.from)} a ${formatCalendarDate(bucket.to)}: ${bucket.created} criados, ${bucket.concluded} concluídos`}
          >
            <div
              className="w-full max-w-5 rounded-t-sm bg-foreground/25"
              style={{ height: `${(bucket.created / max) * 100}%` }}
            />
            <div className="w-full max-w-5 rounded-t-sm bg-primary" style={{ height: `${(bucket.concluded / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-2" aria-hidden="true">
        {buckets.map((bucket, index) => (
          <span key={bucket.from} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground tabular-nums">
            {index % showEvery === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>
      {/* Para leitores de tela: os mesmos números em tabela. */}
      <table className="sr-only">
        <caption>Trabalhos criados e concluídos por período</caption>
        <thead>
          <tr>
            <th>Período</th>
            <th>Criados</th>
            <th>Concluídos</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.from}>
              <td>
                {formatCalendarDate(bucket.from)} a {formatCalendarDate(bucket.to)}
              </td>
              <td>{bucket.created}</td>
              <td>{bucket.concluded}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type JobColumn = { header: string; cell: (item: ReportJob) => React.ReactNode; className?: string };

/** Tabela de trabalhos (PIT e nome com link, cliente, status) com colunas extras. */
export function ReportJobsTable({
  jobs,
  columns,
  showClient = true,
}: {
  jobs: ReportJob[];
  columns: JobColumn[];
  /** Sem a coluna do cliente (quando a tabela já é de um cliente só). */
  showClient?: boolean;
}) {
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">PIT</TableHead>
            <TableHead>Trabalho</TableHead>
            {showClient && <TableHead>Cliente</TableHead>}
            <TableHead>Status</TableHead>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
            <TableHead>Funcionários</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-semibold tabular-nums">#{item.pit}</TableCell>
              <TableCell className="max-w-72">
                <Link href={`/trabalhos/${item.pit}`} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
                  {item.name}
                </Link>
              </TableCell>
              {showClient && (
                <TableCell>
                  <span className="flex max-w-48 items-center gap-2">
                    <ClientLogo
                      name={item.client.name}
                      logoUrl={resolveMediaUrl(item.client.logoKey)}
                      className="size-5 text-[8px]"
                    />
                    <span className="truncate">{item.client.name}</span>
                  </span>
                </TableCell>
              )}
              <TableCell>
                <JobStatusBadge
                  name={item.status.name}
                  textColor={item.status.textColor}
                  backgroundColor={item.status.backgroundColor}
                />
              </TableCell>
              {columns.map((column) => (
                <TableCell key={column.header} className={column.className}>
                  {column.cell(item)}
                </TableCell>
              ))}
              <TableCell>
                {item.assignees.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="flex -space-x-1.5">
                    {item.assignees.slice(0, 4).map((person) => (
                      <UserAvatar
                        key={person.id}
                        name={person.name}
                        imageUrl={resolveMediaUrl(person.image)}
                        alt={person.name}
                        className="size-6 text-[9px] ring-2 ring-card"
                      />
                    ))}
                    {item.assignees.length > 4 && (
                      <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[10px] font-medium ring-2 ring-card">
                        +{item.assignees.length - 4}
                      </span>
                    )}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

export const dueCell = (item: ReportJob) => (item.dueDate ? formatCalendarDate(item.dueDate) : "—");
