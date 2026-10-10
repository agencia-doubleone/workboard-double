"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { getRealtimeState, useRealtimeEvent } from "@/components/realtime/realtime-store";

/** Sem websocket, o Início se atualiza nesse intervalo (com a aba visível). */
const POLL_MS = 60_000;

/** Mantém o Início em dia: recarrega quando chega notificação ou mensagem (ou de tempos em tempos, sem tempo real). */
export function HomeRefresher() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function refreshSoon() {
    // Eventos em sequência (ex.: várias mensagens) viram uma recarga só.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 500);
  }

  useRealtimeEvent((event) => {
    const me = getRealtimeState().userId;
    if (event.type === "notification" || event.type === "notifications.read") refreshSoon();
    if (event.type === "chat.message" && event.author.id !== me) refreshSoon();
    if (event.type === "chat.read" && event.userId === me) refreshSoon();
  });

  useEffect(() => {
    function tick() {
      if (getRealtimeState().status !== "open" && document.visibilityState === "visible") router.refresh();
    }
    const interval = setInterval(tick, POLL_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
