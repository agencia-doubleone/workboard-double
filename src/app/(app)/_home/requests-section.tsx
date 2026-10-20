import { CalendarCheckIcon, InboxIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { EmptyLine, HomeCard, Stat } from "@/components/dashboard";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCompactDay } from "@/lib/calendar";
import { isRequestOverdue, REQUEST_STATUSES, requestCode, type RequestStatus } from "@/lib/client-requests";
import { dayKey } from "@/lib/format";
import { addDays, dayDiff } from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { RequestOverviewItem } from "@/server/client-requests";
import { resolveMediaUrl } from "@/server/media";

const ATTENTION_LIMIT = 8;
const FORECAST_DAYS = 7;
const FORECAST_LIMIT = 8;

type Attention = { kind: "overdue" | "changes" | "approved" | "queue"; label: string };

const ATTENTION_ORDER: Attention["kind"][] = ["overdue", "changes", "approved", "queue"];
const ATTENTION_BADGES = { overdue: "destructive", changes: "warning", approved: "success", queue: "soft" } as const;

/**
 * O que a solicitação espera da equipe: passou da previsão, o cliente pediu
 * alterações ou aprovou a última rodada (falta finalizar), ou ainda está na fila
 * de análise. Null: nada agora (ou já está com o cliente).
 */
function attentionOf(row: RequestOverviewItem, today: string): Attention | null {
  if (isRequestOverdue(row.expectedOn, row.status, today)) {
    const days = dayDiff(row.expectedOn!, today);
    return { kind: "overdue", label: `${days} ${days === 1 ? "dia" : "dias"} de atraso` };
  }
  if (row.lastDelivery.status === "changes_requested") return { kind: "changes", label: "Alterações pedidas" };
  if (row.lastDelivery.status === "approved") return { kind: "approved", label: "Entrega aprovada" };
  if (row.status === "aguardando_analise") {
    const days = dayDiff(dayKey(row.createdAt), today);
    return { kind: "queue", label: days === 0 ? "Chegou hoje" : days === 1 ? "Chegou ontem" : `Na fila há ${days} dias` };
  }
  return null;
}

/**
 * Só admins: as solicitações dos clientes no Início. Números, o que espera a
 * equipe (atrasadas, respostas do cliente às entregas, fila de análise) e as
 * previsões da semana. As mensagens não lidas ficam em "Precisa de resposta".
 */
export function RequestsSection({ rows, today }: { rows: RequestOverviewItem[]; today: string }) {
  const open = rows.filter((row) => !REQUEST_STATUSES[row.status].closed);
  const queue = open.filter((row) => row.status === "aguardando_analise");
  const overdue = open.filter((row) => isRequestOverdue(row.expectedOn, row.status, today));
  const withClient = open.filter((row) => row.lastDelivery.status === "pending");
  const clients = new Set(open.map((row) => row.client.id)).size;

  const attention = open
    .flatMap((row) => {
      const reason = attentionOf(row, today);
      return reason ? [{ row, reason }] : [];
    })
    .sort(
      (a, b) =>
        ATTENTION_ORDER.indexOf(a.reason.kind) - ATTENTION_ORDER.indexOf(b.reason.kind) ||
        (a.row.expectedOn ?? "").localeCompare(b.row.expectedOn ?? "") ||
        a.row.number - b.row.number,
    );

  const forecastEnd = addDays(today, FORECAST_DAYS);
  const forecast = open
    .filter((row) => row.expectedOn && row.expectedOn >= today && row.expectedOn <= forecastEnd)
    .sort((a, b) => a.expectedOn!.localeCompare(b.expectedOn!) || a.number - b.number);

  return (
    <section aria-labelledby="solicitacoes" className="flex flex-col gap-4 border-t pt-8">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="solicitacoes" className="text-base font-semibold">
            Solicitações dos clientes
          </h2>
          <p className="text-sm text-muted-foreground">O que os clientes pediram pelo portal.</p>
        </div>
        <Link
          href="/solicitacoes"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          <InboxIcon className="size-4" />
          Solicitações
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em aberto" value={open.length} detail={clients === 1 ? "de 1 cliente" : `de ${clients} clientes`} />
        <Stat label="Aguardando análise" value={queue.length} detail="na fila da equipe" />
        <Stat label="Atrasadas" value={overdue.length} detail="previsão já passou" tone={overdue.length > 0 ? "bad" : undefined} />
        <Stat label="Com o cliente" value={withClient.length} detail="entregas para aprovar" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <HomeCard title="Esperando a equipe" className="lg:col-span-2">
          {attention.length === 0 ? (
            <EmptyLine icon={SparklesIcon}>Nenhuma solicitação atrasada, na fila ou com resposta do cliente para tratar.</EmptyLine>
          ) : (
            <>
              <ul className="flex flex-col divide-y">
                {attention.slice(0, ATTENTION_LIMIT).map(({ row, reason }) => (
                  <li key={row.id}>
                    <RequestLine row={row}>
                      <Badge variant={ATTENTION_BADGES[reason.kind]} className="shrink-0">
                        {reason.label}
                      </Badge>
                    </RequestLine>
                  </li>
                ))}
              </ul>
              {attention.length > ATTENTION_LIMIT && (
                <Link href="/solicitacoes" className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                  e mais {attention.length - ATTENTION_LIMIT} em Solicitações
                </Link>
              )}
            </>
          )}
        </HomeCard>

        <HomeCard title="Previsões da semana">
          {forecast.length === 0 ? (
            <EmptyLine icon={CalendarCheckIcon}>Nenhuma previsão de entrega para os próximos 7 dias.</EmptyLine>
          ) : (
            <ul className="flex flex-col divide-y">
              {forecast.slice(0, FORECAST_LIMIT).map((row) => {
                const days = dayDiff(today, row.expectedOn!);
                return (
                  <li key={row.id}>
                    <Link
                      href={`/solicitacoes/${row.number}`}
                      className="flex items-center gap-3 py-2.5 outline-none hover:bg-muted/30 focus-visible:bg-muted/40"
                    >
                      <span
                        className={cn(
                          "flex w-16 shrink-0 flex-col text-xs leading-tight tabular-nums",
                          days === 0 ? "text-warning-ink" : "text-muted-foreground",
                        )}
                      >
                        <span className="font-semibold">{days === 0 ? "Hoje" : formatCompactDay(row.expectedOn!)}</span>
                        <span>{days === 0 ? "previsão" : `em ${days} ${days === 1 ? "dia" : "dias"}`}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">
                          <span className="text-muted-foreground tabular-nums">{requestCode(row.number)}</span> {row.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{row.client.name}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </HomeCard>
      </div>
    </section>
  );
}

/** Uma solicitação numa lista do Início: cliente, número, assunto e o que vai à direita. */
function RequestLine({
  row,
  children,
}: {
  row: { number: number; title: string; status: RequestStatus; jobs: number; client: { name: string; logoKey: string | null } };
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/solicitacoes/${row.number}`}
      className="flex items-center gap-3 py-2.5 outline-none hover:bg-muted/30 focus-visible:bg-muted/40"
    >
      <ClientLogo name={row.client.name} logoUrl={resolveMediaUrl(row.client.logoKey)} className="size-8 text-[10px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          <span className="text-muted-foreground tabular-nums">{requestCode(row.number)}</span> {row.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {row.client.name}
          {row.jobs > 0 && ` · ${row.jobs === 1 ? "1 trabalho" : `${row.jobs} trabalhos`}`}
        </span>
      </span>
      <RequestStatusBadge status={row.status} className="hidden shrink-0 md:inline-flex" />
      {children}
    </Link>
  );
}
