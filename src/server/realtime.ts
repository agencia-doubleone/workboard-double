import "server-only";

import { after } from "next/server";

import { env } from "@/env";
import {
  signBoardToken,
  signConnectToken,
  type BoardDisconnectRequest,
  type RealtimeDisconnectRequest,
  type RealtimeEvent,
  type RealtimePublishRequest,
} from "@/lib/realtime/protocol";

// Ponte com o Worker de tempo real (realtime/, no Cloudflare). O banco é a
// fonte de tudo: avisar é um extra. Por isso nada aqui lança erro nem segura a
// resposta (as chamadas vão em after()), e sem REALTIME_URL/REALTIME_SECRET tudo
// vira no-op e as telas se atualizam de tempos em tempos.

const REQUEST_TIMEOUT_MS = 5_000;

export function isRealtimeConfigured() {
  return Boolean(env.REALTIME_URL && env.REALTIME_SECRET);
}

/** Endereço do websocket e um token curto para abrir a conexão como essa pessoa. */
export async function createRealtimeTicket(userId: string) {
  if (!env.REALTIME_URL || !env.REALTIME_SECRET) return null;
  return {
    url: `${env.REALTIME_URL.replace(/^http/, "ws")}/connect`,
    token: await signConnectToken(userId, env.REALTIME_SECRET),
  };
}

/** Entrada na sala de um quadro branco (o acesso já foi conferido por quem chama). */
export async function createBoardTicket(input: { userId: string; boardId: string; name: string }) {
  if (!env.REALTIME_URL || !env.REALTIME_SECRET) return null;
  return {
    url: `${env.REALTIME_URL.replace(/^http/, "ws")}/board`,
    token: await signBoardToken(input, env.REALTIME_SECRET),
  };
}

async function callWorker(
  path: "/publish" | "/disconnect" | "/board/disconnect",
  body: RealtimePublishRequest | RealtimeDisconnectRequest | BoardDisconnectRequest,
) {
  if (!env.REALTIME_URL || !env.REALTIME_SECRET) return;
  try {
    const response = await fetch(`${env.REALTIME_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.REALTIME_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[realtime] ${path} recusado`, response.status, await response.text());
  } catch (error) {
    console.error(`[realtime] ${path} falhou`, error);
  }
}

/** Manda o evento agora para as abas abertas dessas pessoas. */
export async function publishRealtime(to: string[], event: RealtimeEvent) {
  const recipients = [...new Set(to)];
  if (recipients.length === 0) return;
  await callWorker("/publish", { to: recipients, event });
}

/** Como publishRealtime, mas depois da resposta (em Server Actions e Route Handlers). */
export function publishRealtimeAfter(to: string[], event: RealtimeEvent) {
  if (!isRealtimeConfigured()) return;
  after(() => publishRealtime(to, event));
}

/**
 * Fecha a sala de um quadro (acesso alterado ou quadro excluído). Quem ainda
 * pode entrar volta na hora com um token novo.
 */
export function closeBoardRoomAfter(boardId: string) {
  if (!isRealtimeConfigured()) return;
  after(() => callWorker("/board/disconnect", { boardId }));
}

/** Derruba as conexões abertas (pessoa desativada, excluída ou com as sessões encerradas). */
export function disconnectRealtimeAfter(userIds: string[]) {
  if (!isRealtimeConfigured() || userIds.length === 0) return;
  after(() => callWorker("/disconnect", { userIds: [...new Set(userIds)] }));
}
