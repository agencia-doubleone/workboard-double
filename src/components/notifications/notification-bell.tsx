"use client";

import { BellIcon, BellOffIcon, BellRingIcon, CheckCheckIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Hint } from "@/components/hint";
import { JobStatusBadge } from "@/components/job-status-badge";
import { useRealtime, useRealtimeEvent, refreshInboxCounts } from "@/components/realtime/realtime-store";
import {
  requestSystemNotificationPermission,
  useSystemNotificationPermission,
} from "@/components/realtime/system-notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { formatMonth } from "@/lib/calendar";
import { deliveryAnswerSummary } from "@/lib/client-requests";
import { planningAnswerSummary } from "@/lib/notifications";
import { PLANNING_STATUSES } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { getNotifications, readNotifications } from "./actions";
import type { NotificationView } from "./types";

/** Sino do header: contador de não lidas e a lista, carregada ao abrir. */
export function NotificationBell() {
  const router = useRouter();
  const unread = useRealtime((state) => state.counts?.notifications ?? 0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  function load(append = false) {
    startLoading(async () => {
      const before = append ? items?.at(-1)?.updatedAt : undefined;
      // O sino está em todas as telas: uma falha aqui não pode derrubar a página.
      const page = await getNotifications({ before }).catch(() => null);
      setFailed(!page);
      if (!page) return;
      setItems((current) => (append && current ? [...current, ...page.items] : page.items));
      setHasMore(page.hasMore);
    });
  }

  // Chegou algo com a lista aberta: recarrega. Fechada, ela é recarregada ao abrir.
  useRealtimeEvent((event) => {
    if (open && (event.type === "notification" || event.type === "notifications.read")) load();
  });

  function markRead(ids?: string[]) {
    setItems((current) =>
      current?.map((item) => (!ids || ids.includes(item.id) ? { ...item, unread: false } : item)) ?? null,
    );
    void readNotifications({ ids })
      .catch(() => null)
      .then(() => refreshInboxCounts());
  }

  function handleSelect(item: NotificationView) {
    if (item.unread) markRead([item.id]);
    if (item.href) {
      setOpen(false);
      router.push(item.href);
    }
  }

  const label = unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <Hint label="Notificações" side="bottom">
        <PopoverTrigger
          aria-label={label}
          render={<Button variant="ghost" size="icon-sm" className="relative text-muted-foreground hover:text-foreground" />}
        >
          <BellIcon />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-semibold">Notificações</p>
          {items?.some((item) => item.unread) && (
            <Button variant="ghost" size="xs" onClick={() => markRead()} className="text-muted-foreground">
              <CheckCheckIcon data-icon="inline-start" />
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <SystemPermissionBanner />
        <div className="max-h-[min(28rem,65vh)] overflow-y-auto p-1">
          {items === null && failed ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">Não foi possível carregar as notificações.</p>
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
                Tentar de novo
              </Button>
            </div>
          ) : items === null ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
                <BellIcon className="size-5" />
              </span>
              <p className="text-sm font-medium">Nada por aqui</p>
              <p className="text-xs text-muted-foreground">
                Avisamos quando incluírem você num trabalho, mudarem o status ou mandarem mensagem.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onSelect={() => handleSelect(item)} />
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full text-muted-foreground"
              disabled={loading}
              onClick={() => load(true)}
            >
              {loading && <Loader2Icon className="animate-spin" />}
              Carregar mais
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NotificationRow({ item, onSelect }: { item: NotificationView; onSelect: () => void }) {
  const actor = item.actorName ?? "Alguém";
  const job = item.data.pit ? (
    <strong className="font-medium text-foreground">
      #{item.data.pit} {item.data.jobName}
    </strong>
  ) : (
    "um trabalho"
  );
  const who = <strong className="font-medium text-foreground">{actor}</strong>;

  let text: React.ReactNode;
  let detail: React.ReactNode = null;
  switch (item.type) {
    case "job.assigned":
      text = <>{who} incluiu você em {job}</>;
      break;
    case "job.unassigned":
      text = <>{who} tirou você de {job}</>;
      break;
    case "job.status_changed":
      text = <>{who} mudou o status de {job}</>;
      detail = item.data.status && (
        <JobStatusBadge
          name={item.data.status.name}
          textColor={item.data.status.textColor}
          backgroundColor={item.data.status.backgroundColor}
          className="h-5 px-1.5 text-[11px]"
        />
      );
      break;
    case "job.message":
      text =
        item.count > 1 ? (
          <>
            <strong className="font-medium text-foreground">{item.count} mensagens novas</strong> em {job}
          </>
        ) : (
          <>{who} escreveu em {job}</>
        );
      detail = item.data.excerpt && (
        <span className="line-clamp-2">
          {item.count > 1 && `${actor}: `}
          {item.data.excerpt}
        </span>
      );
      break;
    case "job.mention":
      text = <>{who} mencionou você em {job}</>;
      detail = item.data.excerpt && <span className="line-clamp-2">{item.data.excerpt}</span>;
      break;
    case "planning.assigned":
      text = (
        <>
          {who} incluiu você como responsável pelo planejamento de{" "}
          <strong className="font-medium text-foreground">{item.data.clientName ?? "um cliente"}</strong>
        </>
      );
      break;
    case "planning.month_status":
    case "planning.post_status": {
      const client = <strong className="font-medium text-foreground">{item.data.clientName ?? "um cliente"}</strong>;
      const month = item.data.month ? formatMonth(item.data.month) : "";
      text =
        item.type === "planning.month_status" ? (
          <>
            {who} mudou o planejamento de {month} de {client}
          </>
        ) : (
          <>
            {who} mudou um post de {client}
            {item.data.postDate && ` (${item.data.postDate.slice(8)}/${item.data.postDate.slice(5, 7)})`}
          </>
        );
      const status = item.data.planningStatus && PLANNING_STATUSES[item.data.planningStatus];
      detail = (
        <span className="flex flex-col items-start gap-1">
          {status && <Badge variant={status.badge}>{status.label}</Badge>}
          {item.type === "planning.post_status" && item.data.headline && (
            <span className="line-clamp-2">{item.data.headline}</span>
          )}
        </span>
      );
      break;
    }
    case "planning.answered":
      text = (
        <>
          {who} respondeu o planejamento de {item.data.month ? formatMonth(item.data.month) : "um mês"} de{" "}
          <strong className="font-medium text-foreground">{item.data.clientName ?? "um cliente"}</strong>
        </>
      );
      detail = (
        <span className="flex flex-col items-start gap-1">
          {planningAnswerSummary(item.data.approved ?? 0, item.data.changes ?? 0)}
          {item.data.excerpt && <span className="line-clamp-2">“{item.data.excerpt}”</span>}
        </span>
      );
      break;
    case "whiteboard.shared":
      text = (
        <>
          {who} incluiu você no quadro{" "}
          <strong className="font-medium text-foreground">{item.data.boardTitle ?? "sem nome"}</strong>
        </>
      );
      break;
    case "request.created":
    case "request.canceled":
    case "request.delivery_answered":
    case "request.message": {
      const request = item.data.requestNumber ? (
        <strong className="font-medium text-foreground">
          S-{item.data.requestNumber} {item.data.requestTitle}
        </strong>
      ) : (
        "uma solicitação"
      );
      const client = item.data.clientName && <> ({item.data.clientName})</>;
      if (item.type === "request.message") {
        text =
          item.count > 1 ? (
            <>
              <strong className="font-medium text-foreground">{item.count} mensagens novas</strong> em {request}
              {client}
            </>
          ) : (
            <>
              {who} escreveu em {request}
              {client}
            </>
          );
        detail = item.data.excerpt && (
          <span className="line-clamp-2">
            {item.count > 1 && `${actor}: `}
            {item.data.excerpt}
          </span>
        );
      } else if (item.type === "request.delivery_answered") {
        text = (
          <>
            {who} respondeu a rodada {item.data.round} de {request}
            {client}
          </>
        );
        detail = deliveryAnswerSummary(item.data.approved ?? 0, item.data.changes ?? 0);
      } else {
        text = (
          <>
            {who} {item.type === "request.created" ? "abriu a solicitação" : "cancelou a solicitação"} {request}
            {client}
          </>
        );
      }
      break;
    }
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        !item.href && !item.unread && "cursor-default hover:bg-transparent",
      )}
    >
      <UserAvatar name={actor} imageUrl={item.actorImageUrl} className="mt-0.5 size-8" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] leading-snug text-muted-foreground">{text}</span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        <span className="text-xs text-muted-foreground/80" title={item.time.absolute}>
          {item.time.label}
        </span>
      </span>
      <span
        aria-label={item.unread ? "Não lida" : undefined}
        className={cn("mt-2 size-2 shrink-0 rounded-full", item.unread ? "bg-primary" : "bg-transparent")}
      />
    </button>
  );
}

/** Convite para ligar as notificações do sistema (ou aviso de que estão bloqueadas). */
function SystemPermissionBanner() {
  const permission = useSystemNotificationPermission();
  if (permission === "default") {
    return (
      <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2.5">
        <BellRingIcon className="size-4 shrink-0 text-primary" />
        <p className="flex-1 text-xs text-muted-foreground">
          Receba os avisos no computador mesmo com o Workboard em segundo plano.
        </p>
        <Button size="xs" variant="soft" onClick={() => void requestSystemNotificationPermission()}>
          Ativar
        </Button>
      </div>
    );
  }
  if (permission === "denied") {
    return (
      <p className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <BellOffIcon className="size-3.5 shrink-0" />
        As notificações do computador estão bloqueadas neste navegador (cadeado na barra de endereço).
      </p>
    );
  }
  return null;
}
