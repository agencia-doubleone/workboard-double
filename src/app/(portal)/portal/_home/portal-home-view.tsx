import {
  BellIcon,
  CakeIcon,
  CalendarCheckIcon,
  InboxIcon,
  ListChecksIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  SunsetIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { EmptyLine, HomeCard, Stat } from "@/components/dashboard";
import { toRequestRow } from "@/components/requests/present";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/calendar";
import { isRequestOverdue } from "@/lib/client-requests";
import { getFirstName, getGreeting } from "@/lib/greeting";
import { PORTAL_NEW_REQUEST_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";
import { dayDiff } from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { ClientRequestListItem } from "@/server/client-requests";
import { resolveMediaUrl } from "@/server/media";
import type { PortalNotificationItem } from "@/server/portal-notifications";
import {
  AccessCard,
  ForecastList,
  HowItWorks,
  NewsFeed,
  OpenRequestList,
  PendingDeliveries,
  type ForecastEntry,
  type PendingDeliveryEntry,
} from "./sections";

/** Quantas solicitações em aberto aparecem na lista do início (o resto, em Solicitações). */
const OPEN_REQUESTS_SHOWN = 6;
const FORECAST_LIMIT = 5;

const GREETING_ICONS: Record<string, LucideIcon> = { "Bom dia": SunIcon, "Boa tarde": SunsetIcon, "Boa noite": MoonIcon };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "a", "a e b", "a, b e c" */
function joinPt(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

export type PortalHomeData = {
  contact: { name: string; email: string; image: string | null; canApprove: boolean };
  client: { name: string; logoKey: string | null };
  now: Date;
  /** Hoje em Brasília, "AAAA-MM-DD". */
  today: string;
  /** Anos que a empresa completa hoje (aniversário de fundação), ou null. */
  anniversary: number | null;
  /** As solicitações em aberto do cliente (todas, para os números e as previsões). */
  open: { rows: ClientRequestListItem[]; total: number };
  pendingDeliveries: PendingDeliveryEntry[];
  finishedThisYear: number;
  /** Quantas o cliente já teve (zero: mostra como o portal funciona). */
  totalRequests: number;
  news: PortalNotificationItem[];
};

/**
 * O início do portal, com os dados já carregados (page.tsx): a saudação com o
 * resumo do que espera o contato, os números, as entregas para aprovar (com
 * miniaturas), as solicitações em aberto, as próximas previsões, as novidades
 * da Double One e o acesso. Sem nenhuma solicitação ainda, mostra como o
 * portal funciona.
 */
export function PortalHomeView({
  contact,
  client,
  now,
  today,
  anniversary,
  open,
  pendingDeliveries,
  finishedThisYear,
  totalRequests,
  news,
}: PortalHomeData) {
  const rows = open.rows.map((row) => toRequestRow(row, today));
  const unread = rows.reduce((sum, row) => sum + row.messages.unread, 0);
  const forecast: ForecastEntry[] = open.rows
    .filter((row) => row.expectedOn)
    .map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      expectedOn: row.expectedOn!,
      days: dayDiff(today, row.expectedOn!),
      overdue: isRequestOverdue(row.expectedOn, row.status, today),
    }))
    .sort((a, b) => a.expectedOn.localeCompare(b.expectedOn) || a.number - b.number)
    .slice(0, FORECAST_LIMIT);

  // Saudação (no aniversário da empresa, os parabéns) e o resumo do que espera o contato.
  const greeting = getGreeting(now);
  const GreetingIcon = anniversary ? CakeIcon : (GREETING_ICONS[greeting] ?? SunIcon);
  const summaryParts = [
    pendingDeliveries.length > 0 &&
      (contact.canApprove
        ? plural(pendingDeliveries.length, "entrega esperando sua aprovação", "entregas esperando sua aprovação")
        : plural(pendingDeliveries.length, "entrega esperando aprovação", "entregas esperando aprovação")),
    unread > 0 && plural(unread, "mensagem nova da equipe", "mensagens novas da equipe"),
  ].filter((part): part is string => Boolean(part));
  const summary =
    summaryParts.length > 0
      ? `Você tem ${joinPt(summaryParts)}.`
      : open.total > 0
        ? `Nada esperando por você agora. A Double One está cuidando de ${plural(open.total, "solicitação", "solicitações")} da ${client.name}.`
        : totalRequests > 0
          ? "Nenhuma solicitação em aberto. Precisa de algo? É só abrir uma nova."
          : `Este é o portal da ${client.name} com a Double One: peça, acompanhe e aprove por aqui.`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="first-letter:uppercase">{formatDay(today)}</span>
            <span aria-hidden="true">·</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <ClientLogo name={client.name} logoUrl={resolveMediaUrl(client.logoKey)} className="size-4 text-[7px]" />
              <span className="truncate">{client.name}</span>
            </span>
          </p>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                anniversary ? "bg-primary-soft text-primary-ink" : "bg-muted text-muted-foreground",
              )}
            >
              <GreetingIcon className="size-5" />
            </span>
            {anniversary
              ? anniversary === 1
                ? `Parabéns pelo primeiro ano, ${client.name}!`
                : `Parabéns pelos ${anniversary} anos, ${client.name}!`
              : `${greeting}, ${getFirstName(contact.name)}!`}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{summary}</p>
        </div>
        <Link href={PORTAL_NEW_REQUEST_PATH} className={cn(buttonVariants(), "self-start sm:self-auto")}>
          <PlusIcon data-icon="inline-start" />
          Nova solicitação
        </Link>
      </header>

      {totalRequests > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Em aberto" value={open.total} detail="com a Double One" href={PORTAL_REQUESTS_PATH} />
          <Stat
            label="Para aprovar"
            value={pendingDeliveries.length}
            detail={contact.canApprove ? "esperando sua resposta" : "esperando quem aprova"}
            tone={pendingDeliveries.length > 0 ? "warn" : undefined}
            href={pendingDeliveries.length > 0 ? "#para-aprovar" : undefined}
          />
          <Stat label="Mensagens novas" value={unread} detail="da equipe da Double One" />
          <Stat
            label="Finalizadas"
            value={finishedThisYear}
            detail={`em ${today.slice(0, 4)}`}
            tone={finishedThisYear > 0 ? "good" : undefined}
            href={`${PORTAL_REQUESTS_PATH}?situacao=encerradas`}
          />
        </div>
      )}

      {pendingDeliveries.length > 0 && (
        <section
          id="para-aprovar"
          aria-labelledby="para-aprovar-titulo"
          className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-warning/50 bg-warning/5 p-4 shadow-raised"
        >
          <div className="flex flex-col gap-0.5">
            <h2 id="para-aprovar-titulo" className="flex items-center gap-2 text-sm font-semibold">
              <ListChecksIcon className="size-4 text-warning" />
              Para aprovar
            </h2>
            <p className="text-sm text-muted-foreground">
              {contact.canApprove
                ? "A Double One mandou arquivos para você aprovar: aprove cada um ou peça alterações."
                : `A Double One mandou arquivos para a aprovação da ${client.name}. Quem aprova recebeu o aviso.`}
            </p>
          </div>
          <PendingDeliveries
            deliveries={pendingDeliveries}
            canApprove={contact.canApprove}
            now={now}
          />
        </section>
      )}

      {totalRequests === 0 ? (
        <HowItWorks />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <HomeCard
            title="Solicitações em aberto"
            action={{ label: open.total > OPEN_REQUESTS_SHOWN ? `Ver todas (${open.total})` : "Ver todas", href: PORTAL_REQUESTS_PATH }}
            className="lg:col-span-2"
          >
            {rows.length === 0 ? (
              <EmptyLine icon={InboxIcon}>Nenhuma solicitação em aberto agora. Precisa de algo? Abra uma nova.</EmptyLine>
            ) : (
              <OpenRequestList rows={rows.slice(0, OPEN_REQUESTS_SHOWN)} />
            )}
          </HomeCard>

          <HomeCard title="Próximas entregas">
            {forecast.length === 0 ? (
              <EmptyLine icon={CalendarCheckIcon}>A equipe ainda não informou previsões de entrega.</EmptyLine>
            ) : (
              <ForecastList entries={forecast} />
            )}
          </HomeCard>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <HomeCard title="Novidades da Double One" className="lg:col-span-2">
          {news.length === 0 ? (
            <EmptyLine icon={BellIcon}>
              Nada novo por enquanto. Aqui aparecem as entregas, as mensagens e as mudanças de status e de previsão.
            </EmptyLine>
          ) : (
            <NewsFeed items={news} now={now} />
          )}
        </HomeCard>

        <HomeCard title="Seu acesso">
          <AccessCard contact={contact} client={client} />
        </HomeCard>
      </div>
    </div>
  );
}
