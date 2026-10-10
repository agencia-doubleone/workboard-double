"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

import type { RealtimeClientMessage, RealtimeEvent } from "@/lib/realtime/protocol";
import { getInboxCounts } from "@/components/notifications/actions";

// Estado do tempo real no navegador, fora do React para qualquer componente do
// shell ler sem provider: conexão, contadores do sino e do chat e quem está
// digitando. O <RealtimeConnection> (realtime-connection.tsx) abre o websocket
// e alimenta este módulo; telas escutam eventos com useRealtimeEvent.

/** open: websocket conectado. off: tempo real não configurado (as telas recarregam de tempos em tempos). */
export type RealtimeStatus = "connecting" | "open" | "closed" | "off";
export type InboxCounts = { notifications: number; chats: number };

type RealtimeState = {
  status: RealtimeStatus;
  /** Quem está conectado (vem com o token). */
  userId: string | null;
  /** null até a primeira contagem. */
  counts: InboxCounts | null;
  /** Quem está digitando para mim: id → até quando (ms). */
  typing: Record<string, number>;
};

/** Sem sinal novo, o "digitando…" some depois disso. */
export const TYPING_TIMEOUT_MS = 6_000;

const INITIAL_STATE: RealtimeState = { status: "connecting", userId: null, counts: null, typing: {} };
let state = INITIAL_STATE;
const listeners = new Set<() => void>();
const eventHandlers = new Set<(event: RealtimeEvent) => void>();
let socket: WebSocket | null = null;

export function getRealtimeState() {
  return state;
}

export function setRealtimeState(patch: Partial<RealtimeState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Lê um pedaço do estado. O seletor precisa devolver um valor estável (número, texto, booleano). */
export function useRealtime<T>(selector: (current: RealtimeState) => T) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(INITIAL_STATE),
  );
}

export function setRealtimeSocket(next: WebSocket | null) {
  socket = next;
}

/** Manda algo pelo websocket, se estiver conectado (senão, descarta: são sinais efêmeros). */
export function sendRealtime(message: RealtimeClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function stopTyping(userIds: string[]) {
  const typing = { ...state.typing };
  for (const userId of userIds) delete typing[userId];
  setRealtimeState({ typing });
}

/** Tira quem passou do prazo sem mandar sinal novo. */
function pruneTyping() {
  const now = Date.now();
  const expired = Object.keys(state.typing).filter((userId) => state.typing[userId] <= now);
  if (expired.length > 0) stopTyping(expired);
}

export function emitRealtimeEvent(event: RealtimeEvent) {
  if (event.type === "typing") {
    setRealtimeState({ typing: { ...state.typing, [event.from]: Date.now() + TYPING_TIMEOUT_MS } });
    setTimeout(pruneTyping, TYPING_TIMEOUT_MS + 50);
  } else if (event.type === "chat.message" && state.typing[event.author.id]) {
    // Quem mandou a mensagem parou de digitar.
    stopTyping([event.author.id]);
  }
  for (const handler of eventHandlers) handler(event);
}

/** Chama `handler` a cada evento que chega pelo websocket. */
export function useRealtimeEvent(handler: (event: RealtimeEvent) => void) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const listener = (event: RealtimeEvent) => onEvent(event);
    eventHandlers.add(listener);
    return () => {
      eventHandlers.delete(listener);
    };
  }, []);
}

/** A pessoa está digitando para mim agora. */
export function useIsTyping(userId: string | null | undefined) {
  return useRealtime((current) => Boolean(userId && current.typing[userId]));
}

let countsTimer: ReturnType<typeof setTimeout> | undefined;

/** Reconta o sino e o chat no servidor (eventos em sequência viram uma chamada só). */
export function refreshInboxCounts() {
  clearTimeout(countsTimer);
  countsTimer = setTimeout(async () => {
    try {
      const counts = await getInboxCounts();
      if (counts) setRealtimeState({ counts });
    } catch {
      // Sem rede: a próxima recontagem acerta.
    }
  }, 250);
}
