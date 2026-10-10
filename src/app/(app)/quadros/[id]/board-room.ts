import {
  BOARD_ELEMENTS_MAX,
  BOARD_MESSAGE_MAX_LENGTH,
  CLOSE_REVOKED,
  PING,
  PONG,
  type BoardClientMessage,
  type BoardPeer,
  type BoardPointer,
  type BoardServerMessage,
} from "@/lib/realtime/protocol";
import { getBoardTicket } from "../actions";

// Sala ao vivo de um quadro (websocket /board do Worker, em realtime/). Repassa
// elementos e cursores entre quem está com o quadro aberto; quem grava é cada
// navegador, pela Server Action. Fora do React: o canvas liga e desliga.
//
// Cada entrada pede um token novo ao Next (getBoardTicket), que confere o
// acesso. Se o acesso mudar, o Worker fecha a sala e quem ainda pode volta.

/** off: tempo real não configurado (o quadro busca as mudanças de tempos em tempos). */
export type RoomStatus = "connecting" | "open" | "closed" | "off";

export type RoomHandlers = {
  onStatus: (status: RoomStatus) => void;
  /** Conectou (ou reconectou): hora de buscar o que mudou enquanto estava fora. */
  onOpen: () => void;
  onWelcome: (session: string, peers: BoardPeer[]) => void;
  onJoined: (peer: BoardPeer) => void;
  onLeft: (session: string) => void;
  onPointer: (from: string, pointer: BoardPointer) => void;
  onElements: (from: string, elements: unknown[]) => void;
  /** Sem acesso (tirado do quadro, quadro excluído): não adianta tentar de novo. */
  onGone: () => void;
};

const HEARTBEAT_MS = 25_000;
const DEAD_AFTER_MS = 60_000;
const RETRY_MAX_MS = 30_000;

export function openBoardRoom(boardId: string, handlers: RoomHandlers) {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSeen = 0;
  let off = false;

  function scheduleRetry() {
    if (stopped) return;
    const delay = Math.min(RETRY_MAX_MS, 1_000 * 2 ** retries) * (0.5 + Math.random() / 2);
    retries++;
    retryTimer = setTimeout(connect, delay);
  }

  function dispatch(message: BoardServerMessage) {
    switch (message.type) {
      case "welcome":
        handlers.onWelcome(message.session, message.peers);
        break;
      case "joined":
        handlers.onJoined(message.peer);
        break;
      case "left":
        handlers.onLeft(message.session);
        break;
      case "pointer": {
        const { from, x, y, tool, button, selected } = message;
        handlers.onPointer(from, { x, y, tool, button, selected: Array.isArray(selected) ? selected : [] });
        break;
      }
      case "elements":
        if (Array.isArray(message.elements)) handlers.onElements(message.from, message.elements);
        break;
    }
  }

  async function connect() {
    if (stopped || socket || off) return;
    clearTimeout(retryTimer);
    handlers.onStatus("connecting");
    let result: Awaited<ReturnType<typeof getBoardTicket>>;
    try {
      result = await getBoardTicket({ whiteboardId: boardId });
    } catch {
      return scheduleRetry();
    }
    if (stopped || socket) return;
    if (!result.ok) {
      if (result.gone) {
        stopped = true;
        handlers.onStatus("closed");
        return handlers.onGone();
      }
      handlers.onStatus("closed");
      return scheduleRetry();
    }
    if (!result.ticket) {
      off = true;
      return handlers.onStatus("off");
    }

    const current = new WebSocket(`${result.ticket.url}?token=${encodeURIComponent(result.ticket.token)}`);
    socket = current;
    current.onopen = () => {
      retries = 0;
      lastSeen = Date.now();
      // Um primeiro batimento já na abertura: sem nada vindo da aba, o fechamento
      // pedido pelo servidor (acesso alterado) pode não chegar até ela.
      current.send(PING);
      handlers.onStatus("open");
      handlers.onOpen();
    };
    current.onmessage = (message) => {
      lastSeen = Date.now();
      if (message.data === PONG || typeof message.data !== "string") return;
      try {
        dispatch(JSON.parse(message.data) as BoardServerMessage);
      } catch {
        // Mensagem malformada: ignora.
      }
    };
    current.onclose = (event) => {
      if (socket !== current) return;
      socket = null;
      if (stopped) return;
      handlers.onStatus("closed");
      // Acesso alterado (ou sessões encerradas): pede um token novo na hora.
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
    if (document.visibilityState !== "visible" || socket || stopped || off) return;
    retries = 0;
    void connect();
  }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  void connect();

  function send(message: BoardClientMessage) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  return {
    isOpen: () => socket?.readyState === WebSocket.OPEN,
    sendPointer: (pointer: BoardPointer) => send({ type: "pointer", ...pointer }),
    /** Manda em lotes que cabem numa mensagem; devolve false se a sala não está aberta. */
    sendElements(elements: unknown[]) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      let batch: unknown[] = [];
      let size = 0;
      for (const element of elements) {
        const length = JSON.stringify(element).length + 1;
        // Um elemento sozinho maior que a mensagem não passa pelo Worker: vai só pelo banco.
        if (length > BOARD_MESSAGE_MAX_LENGTH - 64) continue;
        if (batch.length > 0 && (size + length > BOARD_MESSAGE_MAX_LENGTH - 64 || batch.length >= BOARD_ELEMENTS_MAX)) {
          send({ type: "elements", elements: batch });
          batch = [];
          size = 0;
        }
        batch.push(element);
        size += length;
      }
      if (batch.length > 0) send({ type: "elements", elements: batch });
      return true;
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      socket?.close();
      socket = null;
    },
  };
}

export type BoardRoom = ReturnType<typeof openBoardRoom>;
