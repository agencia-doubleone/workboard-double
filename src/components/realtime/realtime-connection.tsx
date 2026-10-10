"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { CLOSE_REVOKED, PING, PONG, type RealtimeEvent } from "@/lib/realtime/protocol";
import {
  emitRealtimeEvent,
  getRealtimeState,
  refreshInboxCounts,
  setRealtimeSocket,
  setRealtimeState,
  useRealtimeEvent,
} from "./realtime-store";
import { playNotificationSound, startSoundUnlock, type SoundKind } from "./notification-sound";
import { showSystemNotification, startAttentionTracking } from "./system-notifications";

// Abre o websocket do tempo real (realtime/, no Cloudflare) e cuida dos avisos
// globais: recontar o sino e o chat, aviso na tela (toast), notificação do
// sistema e som. Sem tempo real configurado, reconta de tempos em tempos.

/** Batimento: mantém a conexão viva e percebe quando ela morreu (ex.: o notebook dormiu). */
const HEARTBEAT_MS = 25_000;
const DEAD_AFTER_MS = 60_000;
const RETRY_MAX_MS = 30_000;
/** Sem websocket, os contadores se atualizam nesse intervalo (com a aba visível). */
const POLL_MS = 60_000;

type Ticket = { url: string; token: string; userId: string };

function startConnection() {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSeen = 0;

  function scheduleRetry() {
    if (stopped) return;
    // Espera crescente com um pouco de sorteio, para as abas não voltarem todas juntas.
    const delay = Math.min(RETRY_MAX_MS, 1_000 * 2 ** retries) * (0.5 + Math.random() / 2);
    retries++;
    retryTimer = setTimeout(connect, delay);
  }

  async function connect() {
    if (stopped || socket) return;
    clearTimeout(retryTimer);
    setRealtimeState({ status: "connecting" });
    let response: Response;
    try {
      response = await fetch("/api/realtime/token", { method: "POST" });
    } catch {
      return scheduleRetry();
    }
    if (stopped) return;
    // Tempo real não configurado: as telas recarregam de tempos em tempos.
    if (response.status === 503) return setRealtimeState({ status: "off" });
    // Sessão acabou: sem insistir (volta a tentar quando a aba aparecer de novo).
    if (response.status === 401) return setRealtimeState({ status: "closed" });
    if (!response.ok) return scheduleRetry();
    const ticket = (await response.json()) as Ticket;
    if (stopped || socket) return;

    setRealtimeState({ userId: ticket.userId });
    const current = new WebSocket(`${ticket.url}?token=${encodeURIComponent(ticket.token)}`);
    socket = current;
    setRealtimeSocket(current);
    current.onopen = () => {
      retries = 0;
      lastSeen = Date.now();
      // Um primeiro batimento já na abertura: sem nada vindo da aba, o fechamento
      // pedido pelo servidor (sessões encerradas) pode não chegar até ela.
      current.send(PING);
      setRealtimeState({ status: "open" });
      // O que chegou enquanto estava desconectado.
      refreshInboxCounts();
    };
    current.onmessage = (message) => {
      lastSeen = Date.now();
      if (message.data === PONG || typeof message.data !== "string") return;
      try {
        emitRealtimeEvent(JSON.parse(message.data) as RealtimeEvent);
      } catch {
        // Evento malformado: ignora.
      }
    };
    current.onclose = (event) => {
      if (socket !== current) return;
      socket = null;
      setRealtimeSocket(null);
      if (stopped) return;
      setRealtimeState({ status: "closed" });
      // Sessões encerradas pelo admin: tenta de novo na hora (com sessão válida, volta).
      if (event.code === CLOSE_REVOKED) retries = 0;
      scheduleRetry();
    };
  }

  const heartbeat = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastSeen > DEAD_AFTER_MS) socket.close();
    else socket.send(PING);
  }, HEARTBEAT_MS);

  function wake() {
    if (document.visibilityState !== "visible" || socket || getRealtimeState().status === "off") return;
    retries = 0;
    void connect();
  }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  void connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
    setRealtimeSocket(null);
    socket?.close();
    socket = null;
  };
}

/** Caminho do link, sem a âncora ("/trabalhos/12#mensagens" → "/trabalhos/12"). */
function pathOf(href: string) {
  return href.split("#")[0];
}

export function RealtimeConnection() {
  const router = useRouter();

  useEffect(() => {
    const stopConnection = startConnection();
    const stopAttention = startAttentionTracking();
    const stopSoundUnlock = startSoundUnlock();
    refreshInboxCounts();
    // Sem websocket, reconta de tempos em tempos (e ao voltar para a aba).
    function poll() {
      if (getRealtimeState().status !== "open" && document.visibilityState === "visible") refreshInboxCounts();
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopConnection();
      stopAttention();
      stopSoundUnlock();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  /**
   * Aviso na tela (aba visível), do sistema (ninguém olhando) e o som. Nada disso
   * acontece se a pessoa já está na página do aviso.
   */
  function announce(
    kind: SoundKind,
    notice: { title: string; body: string; href: string | null; tag: string; icon?: string | null },
  ) {
    const visible = document.visibilityState === "visible";
    if (visible && notice.href && window.location.pathname === pathOf(notice.href)) return;
    void playNotificationSound(kind);
    const open = notice.href ? () => router.push(notice.href!) : undefined;
    if (visible) {
      toast(notice.title, {
        description: notice.body || undefined,
        action: open ? { label: "Abrir", onClick: open } : undefined,
      });
    }
    void showSystemNotification({ ...notice, onClick: open });
  }

  useRealtimeEvent((event) => {
    const me = getRealtimeState().userId;
    switch (event.type) {
      case "notification":
        refreshInboxCounts();
        announce("notification", event);
        break;
      case "notifications.read":
        refreshInboxCounts();
        break;
      case "chat.message":
        if (event.author.id === me) break;
        refreshInboxCounts();
        announce("message", {
          title: event.author.name,
          body: event.preview,
          href: `/chat/${event.conversationId}`,
          tag: `chat:${event.conversationId}`,
          icon: event.author.imageUrl,
        });
        break;
      case "chat.read":
        // Li em outra aba (a leitura da outra pessoa só muda o "Visto").
        if (event.userId === me) refreshInboxCounts();
        break;
      case "chat.deleted":
        // Podia ser uma mensagem que eu ainda não tinha lido.
        refreshInboxCounts();
        break;
    }
  });

  return null;
}
