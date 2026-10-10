import { DurableObject } from "cloudflare:workers";

import {
  BOARD_ELEMENTS_MAX,
  BOARD_MESSAGE_MAX_LENGTH,
  BOARD_SELECTION_MAX,
  CLIENT_MESSAGE_MAX_LENGTH,
  CLOSE_REVOKED,
  PING,
  PONG,
  PUBLISH_MAX_RECIPIENTS,
  verifyBoardToken,
  verifyConnectToken,
  type BoardDisconnectRequest,
  type BoardPeer,
  type BoardServerMessage,
  type RealtimeDisconnectRequest,
  type RealtimeEvent,
  type RealtimePublishRequest,
} from "../../src/lib/realtime/protocol";

// Servidor de tempo real do Workboard. Não guarda nada nem acessa o banco: o
// Next grava e depois chama /publish; aqui só se repassa o evento para as abas
// abertas de cada pessoa. Rotas:
//   GET  /connect?token=...  websocket do navegador (token assinado pelo Next)
//   GET  /board?token=...    websocket da sala de um quadro branco
//   POST /publish            Next → abas de quem está em `to`
//   POST /disconnect         Next → derruba as conexões (pessoa desativada)
//   POST /board/disconnect   Next → fecha a sala de um quadro (acesso mudou, excluído)
// Uma equipe cabe num objeto só ("hub"); cada socket leva o id da pessoa como
// tag, e os das salas também a tag "board:<id>" e os dados da sala (attachment).

export interface Env {
  HUB: DurableObjectNamespace<Hub>;
  /** Mesmo valor de REALTIME_SECRET no Workboard (wrangler secret put REALTIME_SECRET). */
  REALTIME_SECRET: string;
  /** Origens que podem abrir o websocket, separadas por vírgula. Vazio: qualquer uma. */
  ALLOWED_ORIGINS?: string;
}

const USER_HEADER = "X-Workboard-User";
const BOARD_HEADER = "X-Workboard-Board";
const NAME_HEADER = "X-Workboard-Name";
const BODY_MAX_BYTES = 64 * 1024;
const USER_ID_MAX_LENGTH = 64;

/** Dados de um socket de sala (o das abas comuns não tem). */
type BoardSocket = BoardPeer & { board: string };

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const hub = env.HUB.get(env.HUB.idFromName("hub"));

    if (url.pathname === "/connect" || url.pathname === "/board") return connect(request, url, env, hub);
    if (url.pathname === "/publish" || url.pathname === "/disconnect" || url.pathname === "/board/disconnect") {
      if (request.method !== "POST") return text("Use POST.", 405);
      if (!(await isAuthorized(request, env))) return text("Não autorizado.", 401);
      const body = await readJson(request);
      if (url.pathname === "/publish") {
        const input = parsePublish(body);
        if (!input) return text("Pedido inválido.", 400);
        const delivered = await hub.publish(input.to, input.event);
        return Response.json({ ok: true, delivered });
      }
      if (url.pathname === "/board/disconnect") {
        const input = parseBoardDisconnect(body);
        if (!input) return text("Pedido inválido.", 400);
        const closed = await hub.closeBoard(input.boardId);
        return Response.json({ ok: true, closed });
      }
      const input = parseDisconnect(body);
      if (!input) return text("Pedido inválido.", 400);
      const closed = await hub.disconnect(input.userIds);
      return Response.json({ ok: true, closed });
    }
    if (url.pathname === "/") return text("Workboard: tempo real no ar.");
    return text("Não encontrado.", 404);
  },
} satisfies ExportedHandler<Env>;

async function connect(request: Request, url: URL, env: Env, hub: DurableObjectStub<Hub>) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return text("Esperado um websocket.", 426);
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin");
  if (allowed.length > 0 && (!origin || !allowed.includes(origin))) return text("Origem não permitida.", 403);

  const token = url.searchParams.get("token") ?? "";
  // Cabeçalhos novos: quem é (e em que quadro está) vem só do token.
  if (url.pathname === "/board") {
    const claims = await verifyBoardToken(token, env.REALTIME_SECRET);
    if (!claims || !isUserId(claims.boardId)) return text("Token inválido ou vencido.", 401);
    return hub.fetch(
      new Request(url.toString(), {
        headers: {
          Upgrade: "websocket",
          [USER_HEADER]: claims.userId,
          [BOARD_HEADER]: claims.boardId,
          [NAME_HEADER]: encodeURIComponent(claims.name),
        },
      }),
    );
  }
  const claims = await verifyConnectToken(token, env.REALTIME_SECRET);
  if (!claims) return text("Token inválido ou vencido.", 401);
  return hub.fetch(new Request(url.toString(), { headers: { Upgrade: "websocket", [USER_HEADER]: claims.userId } }));
}

async function isAuthorized(request: Request, env: Env) {
  if (!env.REALTIME_SECRET) return false;
  const encoder = new TextEncoder();
  const expected = encoder.encode(`Bearer ${env.REALTIME_SECRET}`);
  const received = encoder.encode(request.headers.get("Authorization") ?? "");
  return expected.byteLength === received.byteLength && crypto.subtle.timingSafeEqual(expected, received);
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > BODY_MAX_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isUserId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= USER_ID_MAX_LENGTH;
}

function parseUserIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > PUBLISH_MAX_RECIPIENTS) return null;
  return value.every(isUserId) ? (value as string[]) : null;
}

function parsePublish(body: unknown): RealtimePublishRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { to, event } = body as Record<string, unknown>;
  const userIds = parseUserIds(to);
  if (!userIds || typeof event !== "object" || event === null) return null;
  if (typeof (event as { type?: unknown }).type !== "string") return null;
  return { to: userIds, event: event as RealtimeEvent };
}

function parseDisconnect(body: unknown): RealtimeDisconnectRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const userIds = parseUserIds((body as Record<string, unknown>).userIds);
  return userIds ? { userIds } : null;
}

function parseBoardDisconnect(body: unknown): BoardDisconnectRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { boardId } = body as Record<string, unknown>;
  return isUserId(boardId) ? { boardId } : null;
}

function text(message: string, status = 200) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Dados da sala guardados no socket (null nas abas comuns ou se o socket já não responde). */
function boardOf(socket: WebSocket) {
  try {
    return socket.deserializeAttachment() as BoardSocket | null;
  } catch {
    return null;
  }
}

/**
 * Guarda os websockets abertos. Usa a API de hibernação: com todo mundo parado,
 * o objeto sai da memória e as conexões continuam abertas (sem custo de duração).
 */
export class Hub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async fetch(request: Request) {
    const userId = request.headers.get(USER_HEADER);
    if (!isUserId(userId)) return text("Pessoa inválida.", 400);
    const boardId = request.headers.get(BOARD_HEADER);
    const { 0: client, 1: server } = new WebSocketPair();
    if (!boardId) {
      this.ctx.acceptWebSocket(server, [userId]);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Sala de um quadro: avisa quem já está e conta para quem chegou quem está lá.
    const peer: BoardPeer = {
      session: crypto.randomUUID().slice(0, 12),
      userId,
      name: decodeURIComponent(request.headers.get(NAME_HEADER) ?? "").slice(0, 80) || "Alguém",
    };
    const peers = this.boardSockets(boardId).map(({ data }) => ({
      session: data.session,
      userId: data.userId,
      name: data.name,
    }));
    this.ctx.acceptWebSocket(server, [userId, `board:${boardId}`]);
    server.serializeAttachment({ ...peer, board: boardId } satisfies BoardSocket);
    this.sendTo(server, { type: "welcome", session: peer.session, peers });
    this.broadcast(boardId, { type: "joined", peer }, peer.session);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sockets abertos de uma sala, com os dados de cada um. */
  private boardSockets(boardId: string) {
    return this.ctx.getWebSockets(`board:${boardId}`).flatMap((socket) => {
      const data = boardOf(socket);
      return data ? [{ socket, data }] : [];
    });
  }

  private sendTo(socket: WebSocket, message: BoardServerMessage | string) {
    try {
      socket.send(typeof message === "string" ? message : JSON.stringify(message));
    } catch {
      // Socket fechando: a aba reconecta sozinha.
    }
  }

  /** Manda para todos da sala, menos quem mandou. */
  private broadcast(boardId: string, message: BoardServerMessage, exceptSession?: string) {
    const data = JSON.stringify(message);
    for (const { socket, data: info } of this.boardSockets(boardId)) {
      if (info.session !== exceptSession) this.sendTo(socket, data);
    }
  }

  /** Manda o evento para todas as abas de cada pessoa; devolve quantas receberam. */
  publish(to: string[], event: RealtimeEvent) {
    const data = JSON.stringify(event);
    let delivered = 0;
    for (const userId of new Set(to)) {
      for (const socket of this.ctx.getWebSockets(userId)) {
        // As salas de quadro não recebem avisos (a aba tem a conexão comum também).
        if (boardOf(socket)) continue;
        try {
          socket.send(data);
          delivered++;
        } catch {
          // Socket fechando: a aba reconecta sozinha.
        }
      }
    }
    return delivered;
  }

  /** Derruba tudo dessas pessoas, inclusive as salas de quadro. */
  disconnect(userIds: string[]) {
    let closed = 0;
    for (const userId of new Set(userIds)) {
      for (const socket of this.ctx.getWebSockets(userId)) {
        try {
          socket.close(CLOSE_REVOKED, "Sessão encerrada");
          closed++;
        } catch {
          // Já estava fechado.
        }
      }
    }
    return closed;
  }

  /** Fecha a sala: cada aba pede um token novo, e o Next decide quem ainda entra. */
  closeBoard(boardId: string) {
    let closed = 0;
    for (const { socket } of this.boardSockets(boardId)) {
      try {
        socket.close(CLOSE_REVOKED, "Acesso alterado");
        closed++;
      } catch {
        // Já estava fechado.
      }
    }
    return closed;
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const board = boardOf(socket);
    if (board) return this.boardMessage(board, message);

    if (message.length > CLIENT_MESSAGE_MAX_LENGTH) return;
    const [userId] = this.ctx.getTags(socket);
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof data !== "object" || data === null) return;
    const { type, to } = data as Record<string, unknown>;
    // "Digitando…": só repassa; quem recebe decide se mostra (conversa aberta com essa pessoa).
    if (type === "typing" && isUserId(to) && to !== userId) {
      this.publish([to], { type: "typing", from: userId });
    }
  }

  /** Sala do quadro: repassa cursores e elementos para os outros, com quem mandou. */
  private boardMessage(board: BoardSocket, message: string) {
    if (message.length > BOARD_MESSAGE_MAX_LENGTH) return;
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof data !== "object" || data === null) return;
    const input = data as Record<string, unknown>;
    if (input.type === "pointer") {
      if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) return;
      const selected = Array.isArray(input.selected)
        ? input.selected.filter((id): id is string => isUserId(id)).slice(0, BOARD_SELECTION_MAX)
        : [];
      this.broadcast(
        board.board,
        {
          type: "pointer",
          from: board.session,
          x: input.x,
          y: input.y,
          tool: input.tool === "laser" ? "laser" : "pointer",
          button: input.button === "down" ? "down" : "up",
          selected,
        },
        board.session,
      );
    } else if (input.type === "elements") {
      // O conteúdo é do Excalidraw: quem recebe confere cada elemento antes de usar.
      if (!Array.isArray(input.elements) || input.elements.length === 0 || input.elements.length > BOARD_ELEMENTS_MAX) {
        return;
      }
      this.broadcast(board.board, { type: "elements", from: board.session, elements: input.elements }, board.session);
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const board = boardOf(socket);
    // Primeiro completa o fechamento (senão a aba fica esperando); depois avisa a sala.
    try {
      socket.close(code, reason);
    } catch {
      // Códigos reservados (ex.: 1005) não podem ser devolvidos; o socket fecha do mesmo jeito.
    }
    if (board) this.broadcast(board.board, { type: "left", session: board.session }, board.session);
  }
}
