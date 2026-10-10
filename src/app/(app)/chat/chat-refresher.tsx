"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getRealtimeState, useRealtimeEvent } from "@/components/realtime/realtime-store";

/** Sem websocket, a tela do chat recarrega nesse intervalo (com a aba visível). */
const POLL_MS = 10_000;

/** Mantém a lista e a conversa em dia: recarrega a cada evento do chat (ou de tempos em tempos, sem tempo real). */
export function ChatRefresher() {
  const router = useRouter();

  useRealtimeEvent((event) => {
    if (event.type === "chat.message" || event.type === "chat.deleted") router.refresh();
    // Li em outra aba: as não lidas da lista mudam.
    if (event.type === "chat.read" && event.userId === getRealtimeState().userId) router.refresh();
  });

  useEffect(() => {
    function tick() {
      if (getRealtimeState().status !== "open" && document.visibilityState === "visible") router.refresh();
    }
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
