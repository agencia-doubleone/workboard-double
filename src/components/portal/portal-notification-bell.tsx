"use client";

import { BellIcon, CheckCheckIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition } from "react";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { REQUEST_READ_EVENT } from "@/lib/client-requests";
import { PORTAL_NOTIFICATIONS_POLL_MS } from "@/lib/portal-notifications";
import { cn } from "@/lib/utils";
import {
  getPortalNotifications,
  getPortalUnreadCount,
  readPortalNotifications,
  type PortalNotificationView,
} from "./portal-notification-actions";

/**
 * Sino do portal: o número de não lidas e a lista, carregada ao abrir. Sem
 * tempo real no portal: reconta a cada PORTAL_NOTIFICATIONS_POLL_MS com a aba
 * visível, ao voltar para ela e quando uma solicitação é aberta (as
 * notificações dela viram lidas).
 */
export function PortalNotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PortalNotificationView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  function recount() {
    void getPortalUnreadCount()
      .then((count) => {
        if (typeof count === "number") setUnread(count);
      })
      .catch(() => null);
  }
  const recountFromEffect = useEffectEvent(recount);

  useEffect(() => {
    recountFromEffect();
    function tick() {
      if (document.visibilityState === "visible") recountFromEffect();
    }
    const timer = window.setInterval(tick, PORTAL_NOTIFICATIONS_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener(REQUEST_READ_EVENT, tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener(REQUEST_READ_EVENT, tick);
    };
  }, []);

  function load(append = false) {
    startLoading(async () => {
      const before = append ? items?.at(-1)?.updatedAt : undefined;
      // O sino está em todas as telas: uma falha aqui não pode derrubar a página.
      const page = await getPortalNotifications({ before }).catch(() => null);
      setFailed(!page);
      if (!page) return;
      setItems((current) => (append && current ? [...current, ...page.items] : page.items));
      setHasMore(page.hasMore);
    });
    recount();
  }

  function markRead(ids?: string[]) {
    setItems((current) => current?.map((item) => (!ids || ids.includes(item.id) ? { ...item, unread: false } : item)) ?? null);
    setUnread((count) => (ids ? Math.max(0, count - ids.length) : 0));
    void readPortalNotifications({ ids })
      .catch(() => null)
      .then(() => recount());
  }

  function handleSelect(item: PortalNotificationView) {
    if (item.unread) markRead([item.id]);
    setOpen(false);
    router.push(item.href);
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
                Avisamos quando a Double One mandar algo para você aprovar, escrever numa solicitação ou mudar o status ou a
                previsão de entrega.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <UserAvatar name={item.actorName ?? "Double One"} imageUrl={item.actorImageUrl} className="mt-0.5 size-8" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("text-[13px] leading-snug", item.unread ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {item.title}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
                      <span className="text-xs text-muted-foreground/80" title={item.time.absolute}>
                        {item.actorName ? `${item.actorName} (Double One) · ` : ""}
                        {item.time.label}
                      </span>
                    </span>
                    <span
                      aria-label={item.unread ? "Não lida" : undefined}
                      className={cn("mt-2 size-2 shrink-0 rounded-full", item.unread ? "bg-primary" : "bg-transparent")}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <Button variant="ghost" size="sm" className="mt-1 w-full text-muted-foreground" disabled={loading} onClick={() => load(true)}>
              {loading && <Loader2Icon className="animate-spin" />}
              Carregar mais
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
