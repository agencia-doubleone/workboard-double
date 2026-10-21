import {
  ArrowRightIcon,
  CalendarClockIcon,
  FileIcon,
  ImagesIcon,
  InboxIcon,
  ListChecksIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import type { RequestRowView } from "@/components/requests/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { requestCode } from "@/lib/client-requests";
import { formatRelative } from "@/lib/format";
import { getFileExtension, isPreviewableImage } from "@/lib/media";
import { formatMonth } from "@/lib/calendar";
import { PORTAL_NEW_REQUEST_PATH, PORTAL_PLANNING_PATH, PORTAL_PROFILE_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";
import {
  portalNotificationHref,
  portalNotificationText,
  type PortalNotificationType,
} from "@/lib/portal-notifications";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/server/media";
import type { PortalNotificationItem } from "@/server/portal-notifications";

// Partes do início do portal (componentes de servidor; os dados chegam prontos
// da página). Tudo aqui é do cliente do contato: a página filtra pela sessão.

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const PLAYABLE_VIDEO = /^video\/(mp4|webm|ogg)$/;

export type PendingDeliveryEntry = {
  id: string;
  round: number;
  files: number;
  sentAt: Date;
  sentByName: string;
  request: { number: number; title: string };
  previews: { id: string; name: string; key: string; type: string }[];
};

/** As rodadas esperando resposta, com as miniaturas dos primeiros arquivos. */
export function PendingDeliveries({
  deliveries,
  canApprove,
  now,
}: {
  deliveries: PendingDeliveryEntry[];
  canApprove: boolean;
  now: Date;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {deliveries.map((delivery) => {
        const href = `${PORTAL_REQUESTS_PATH}/${delivery.request.number}#entregas`;
        const hidden = delivery.files - delivery.previews.length;
        return (
          <li key={delivery.id}>
            <Link
              href={href}
              className="group flex flex-col gap-3 rounded-lg border bg-card p-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex-row sm:items-center"
            >
              <span className="flex shrink-0 gap-1.5" aria-hidden="true">
                {delivery.previews.map((file) => (
                  <FileThumb key={file.id} file={file} />
                ))}
                {hidden > 0 && (
                  <span className="flex size-14 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
                    +{hidden}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                    {requestCode(delivery.request.number)}
                  </span>
                  <span className="truncate text-sm font-medium">{delivery.request.title}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Rodada {delivery.round} · {delivery.files === 1 ? "1 arquivo" : `${delivery.files} arquivos`} · enviada{" "}
                  {formatRelative(delivery.sentAt, now)} por {delivery.sentByName}
                </span>
              </span>
              <span className={cn(buttonVariants({ variant: canApprove ? "default" : "outline" }), "shrink-0 self-start sm:self-center")}>
                {canApprove ? "Responder" : "Ver arquivos"}
                <ArrowRightIcon data-icon="inline-end" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Miniatura de um arquivo da rodada: a imagem, ou o tipo (vídeo, PDF...). */
function FileThumb({ file }: { file: { name: string; key: string; type: string } }) {
  const url = resolveMediaUrl(file.key);
  if (url && isPreviewableImage(file.type)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arquivo do CDN
      <img src={url} alt="" loading="lazy" className="size-14 rounded-md border bg-muted object-cover" />
    );
  }
  const video = PLAYABLE_VIDEO.test(file.type);
  return (
    <span className="flex size-14 flex-col items-center justify-center gap-1 rounded-md border bg-muted text-muted-foreground">
      {video ? <PlayIcon className="size-4" /> : <FileIcon className="size-4" />}
      <span className="max-w-12 truncate text-[9px] font-semibold uppercase">{getFileExtension(file.name) || "arquivo"}</span>
    </span>
  );
}

/** As solicitações em aberto: número, assunto, novidades, previsão e status. */
export function OpenRequestList({ rows }: { rows: RequestRowView[] }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`${PORTAL_REQUESTS_PATH}/${row.number}`}
            className="flex flex-col gap-1.5 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{requestCode(row.number)}</span>
              <span className={cn("truncate text-sm", row.messages.unread > 0 ? "font-semibold" : "font-medium")}>{row.title}</span>
              {row.messages.unread > 0 && (
                <span className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {row.messages.unread}
                  <span className="sr-only"> mensagens não lidas</span>
                </span>
              )}
              {row.pendingDelivery && (
                <Badge variant="warning" className="shrink-0">
                  Para aprovar
                </Badge>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              {row.expectedOn && (
                <span className={cn("tabular-nums", row.overdue && "font-medium text-destructive-ink")}>
                  Previsão {row.expectedOn.label}
                  {row.overdue && <span className="sr-only"> (atrasada)</span>}
                </span>
              )}
              <RequestStatusBadge status={row.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type ForecastEntry = { id: string; number: number; title: string; expectedOn: string; days: number; overdue: boolean };

/** As próximas previsões de entrega, com o dia em destaque (as atrasadas primeiro, em vermelho). */
export function ForecastList({ entries }: { entries: ForecastEntry[] }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={`${PORTAL_REQUESTS_PATH}/${entry.number}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span
              className={cn(
                "flex size-11 shrink-0 flex-col items-center justify-center rounded-lg border leading-none",
                entry.overdue
                  ? "border-destructive/30 bg-destructive/10 text-destructive-ink"
                  : entry.days === 0
                    ? "border-primary/40 bg-primary-soft text-primary-ink"
                    : "bg-muted/50",
              )}
            >
              <span className="text-base font-semibold tabular-nums">{Number(entry.expectedOn.slice(8))}</span>
              <span className="text-[10px] font-medium uppercase">{MONTHS[Number(entry.expectedOn.slice(5, 7)) - 1]}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{entry.title}</span>
              <span className={cn("text-xs", entry.overdue ? "font-medium text-destructive-ink" : "text-muted-foreground")}>
                {requestCode(entry.number)} ·{" "}
                {entry.overdue
                  ? `atrasada há ${-entry.days} ${entry.days === -1 ? "dia" : "dias"}`
                  : entry.days === 0
                    ? "previsão para hoje"
                    : entry.days === 1
                      ? "amanhã"
                      : `em ${entry.days} dias`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Pauta ou artes do planejamento esperando resposta, uma linha por mês e etapa. */
export function PendingPlanning({
  rows,
  canApprove,
}: {
  rows: { month: string; stage: "pauta" | "arte"; posts: number }[];
  canApprove: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const Icon = row.stage === "pauta" ? NotebookPenIcon : ImagesIcon;
        return (
          <li key={`${row.month}-${row.stage}`}>
            <Link
              href={`${PORTAL_PLANNING_PATH}?mes=${row.month}`}
              className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warning/14 text-warning-ink">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium first-letter:uppercase">
                  {row.stage === "pauta" ? "Pauta" : "Artes"} de {formatMonth(row.month)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.posts === 1 ? "1 post" : `${row.posts} posts`} do planejamento
                  {canApprove ? " esperando sua resposta" : " esperando quem aprova"}
                </span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const NEWS_ICONS: Record<PortalNotificationType, LucideIcon> = {
  "request.created": InboxIcon,
  "request.delivery": ListChecksIcon,
  "request.message": MessageSquareIcon,
  "request.status": RefreshCwIcon,
  "request.expected_on": CalendarClockIcon,
  "planning.brief": NotebookPenIcon,
  "planning.art": ImagesIcon,
};

/** O que a Double One fez nas solicitações (os avisos do sino, os mais recentes primeiro). */
export function NewsFeed({ items, now }: { items: PortalNotificationItem[]; now: Date }) {
  return (
    <ol className="-mx-2 flex flex-col">
      {items.map((item) => {
        const Icon = NEWS_ICONS[item.type];
        const text = portalNotificationText(item);
        const unread = !item.readAt;
        return (
          <li key={item.id}>
            <Link
              href={portalNotificationHref(item)}
              className="flex items-start gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  unread ? "bg-primary-soft text-primary-ink" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-sm leading-snug", unread ? "font-medium" : "text-muted-foreground")}>{text.title}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{text.body}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                <span className="whitespace-nowrap">{formatRelative(item.updatedAt, now)}</span>
                {unread && (
                  <span className="size-2 rounded-full bg-primary">
                    <span className="sr-only">Não lida</span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: SendIcon,
    title: "Peça pelo portal",
    text: "Abra uma solicitação com o assunto e o briefing. Dá para colar imagens e mandar referências.",
  },
  {
    icon: MessagesSquareIcon,
    title: "Acompanhe e converse",
    text: "Veja o status e a previsão de entrega e fale com a equipe da Double One na própria solicitação.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Aprove as entregas",
    text: "Os arquivos chegam aqui: aprove cada um ou peça alterações, com comentários.",
  },
];

/** Para quem ainda não tem nenhuma solicitação: como o portal funciona. */
export function HowItWorks() {
  return (
    <section aria-labelledby="como-funciona" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-raised">
      <div className="flex flex-col gap-1">
        <h2 id="como-funciona" className="text-base font-semibold">
          Como funciona
        </h2>
        <p className="text-sm text-muted-foreground">Tudo o que você pede à Double One fica aqui, do pedido à aprovação.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-lg border bg-muted/30 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
              <step.icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">
                <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {step.title}
              </span>
              <span className="text-xs text-muted-foreground">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link href={PORTAL_NEW_REQUEST_PATH} className={cn(buttonVariants(), "self-start")}>
        Abrir a primeira solicitação
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </section>
  );
}

/** O contato e a empresa: quem está no portal e o que pode fazer. */
export function AccessCard({
  contact,
  client,
}: {
  contact: { name: string; email: string; image: string | null; canApprove: boolean };
  client: { name: string; logoKey: string | null };
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={contact.name} imageUrl={resolveMediaUrl(contact.image)} className="size-11" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{contact.name}</span>
          <span className="truncate text-xs text-muted-foreground">{contact.email}</span>
        </span>
      </div>
      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-xs text-muted-foreground">Empresa</dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            <ClientLogo name={client.name} logoUrl={resolveMediaUrl(client.logoKey)} className="size-5 text-[8px]" />
            <span className="truncate">{client.name}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-xs text-muted-foreground">Entregas</dt>
          <dd>
            {contact.canApprove ? (
              <Badge variant="success">Você aprova</Badge>
            ) : (
              <Badge variant="outline">Só acompanha</Badge>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">Para entrar, use este e-mail: mandamos um código a cada acesso.</p>
      <Link href={PORTAL_PROFILE_PATH} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
        Meu perfil
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </div>
  );
}
