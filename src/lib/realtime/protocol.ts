// Protocolo do tempo real. O Next grava tudo no banco e depois avisa o Worker
// (realtime/, no Cloudflare), que repassa o evento para as abas abertas de cada
// pessoa. O navegador entra com um token curto assinado pelo Next.
//
// Duas conexões: /connect (avisos e chat, uma por aba) e /board (a sala de um
// quadro branco, só com o quadro aberto). Na sala, o Worker repassa os elementos
// e os cursores entre quem está no mesmo quadro; quem grava no banco é o Next.
//
// Sem dependências e só com Web Crypto: o Worker importa este mesmo arquivo.
// Mudou aqui, publique o Worker de novo (cd realtime && npm run deploy).

/** O token de conexão só serve para abrir o websocket: vale por pouco tempo. */
export const CONNECT_TOKEN_TTL_SECONDS = 60;
const CONNECT_TOKEN_VERSION = 1;

/**
 * Fechamento pedido pelo servidor: pessoa desativada, sessões encerradas ou, na
 * sala do quadro, acesso alterado ou quadro excluído (o navegador pede um token
 * novo; se não puder mais entrar, o Next recusa).
 */
export const CLOSE_REVOKED = 4001;

/** Batimento em texto puro: o Worker responde "pong" sem sair da hibernação. */
export const PING = "ping";
export const PONG = "pong";

/** Limites que o Worker aplica ao que chega. */
export const PUBLISH_MAX_RECIPIENTS = 500;
export const CLIENT_MESSAGE_MAX_LENGTH = 512;
/** Uma mensagem da sala do quadro (elementos em lote). O navegador divide o que passar disso. */
export const BOARD_MESSAGE_MAX_LENGTH = 512 * 1024;
export const BOARD_ELEMENTS_MAX = 2_000;
export const BOARD_SELECTION_MAX = 100;

export type RealtimeNotificationEvent = {
  type: "notification";
  /** Texto pronto para o aviso na tela e a notificação do sistema. */
  title: string;
  body: string;
  /** Para onde o clique leva; null quando não há página (ex.: a pessoa saiu do trabalho). */
  href: string | null;
  jobId: string | null;
  /** Avisos com a mesma tag se substituem na notificação do sistema (várias abas, mensagens seguidas). */
  tag: string;
};

export type RealtimeChatMessageEvent = {
  type: "chat.message";
  conversationId: string;
  messageId: string;
  author: { id: string; name: string; imageUrl: string | null };
  /** Começo do texto (ou "Enviou um arquivo"), para o aviso. */
  preview: string;
};

/** Eventos que chegam ao navegador. */
export type RealtimeEvent =
  | RealtimeNotificationEvent
  /** Notificações lidas em outra aba (ou ao abrir o trabalho): recontar. */
  | { type: "notifications.read" }
  | RealtimeChatMessageEvent
  /** `userId` leu a conversa até `lastReadAt` (o "Visto"). */
  | { type: "chat.read"; conversationId: string; userId: string; lastReadAt: string }
  | { type: "chat.deleted"; conversationId: string; messageId: string }
  /** Repassado pelo Worker: quem está digitando sai do token, nunca do navegador. */
  | { type: "typing"; from: string };

/** O que o navegador manda pelo websocket (além do PING). */
export type RealtimeClientMessage = { type: "typing"; to: string };

/** POST /publish (Next → Worker), com "Authorization: Bearer <segredo>". */
export type RealtimePublishRequest = { to: string[]; event: RealtimeEvent };

/** POST /disconnect (Next → Worker): derruba as conexões dessas pessoas (inclusive nas salas). */
export type RealtimeDisconnectRequest = { userIds: string[] };

// Sala do quadro branco (/board).

/** Quem está na sala. `session` é a aba (a mesma pessoa pode estar em duas). */
export type BoardPeer = { session: string; userId: string; name: string };

export type BoardPointer = {
  /** Posição no quadro (coordenadas da cena, não da tela). */
  x: number;
  y: number;
  tool: "pointer" | "laser";
  button: "up" | "down";
  /** Ids dos elementos selecionados (aparecem com a cor da pessoa para os outros). */
  selected: string[];
};

/** O que o navegador manda na sala (além do PING). Elementos vão como vieram do Excalidraw. */
export type BoardClientMessage = ({ type: "pointer" } & BoardPointer) | { type: "elements"; elements: unknown[] };

/** O que chega da sala. `from` é a `session` de quem mandou; nunca volta para quem mandou. */
export type BoardServerMessage =
  | { type: "welcome"; session: string; peers: BoardPeer[] }
  | { type: "joined"; peer: BoardPeer }
  | { type: "left"; session: string }
  | ({ type: "pointer"; from: string } & BoardPointer)
  | { type: "elements"; from: string; elements: unknown[] };

/** POST /board/disconnect (Next → Worker): fecha a sala (acesso mudou ou o quadro foi excluído). */
export type BoardDisconnectRequest = { boardId: string };

// Tokens: "<payload>.<assinatura>", ambos em base64url sem padding. A assinatura
// é HMAC-SHA256 de "<finalidade>.<payload>" com o segredo compartilhado; a
// finalidade ("connect", "board") impede usar um token no lugar do outro.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function importKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

type TokenPurpose = "connect" | "board";

async function signToken(purpose: TokenPurpose, claims: Record<string, unknown>, secret: string, now: number) {
  const payload = { v: CONNECT_TOKEN_VERSION, ...claims, exp: Math.floor(now / 1000) + CONNECT_TOKEN_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(`${purpose}.${body}`));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** O conteúdo do token, se a assinatura confere e ele não venceu; senão null. */
async function readToken(purpose: TokenPurpose, token: string, secret: string, now: number) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      fromBase64Url(signature),
      encoder.encode(`${purpose}.${body}`),
    );
    if (!valid) return null;
    const payload: unknown = JSON.parse(decoder.decode(fromBase64Url(body)));
    if (typeof payload !== "object" || payload === null) return null;
    const claims = payload as Record<string, unknown>;
    if (claims.v !== CONNECT_TOKEN_VERSION || typeof claims.sub !== "string" || !claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
    return claims as Record<string, unknown> & { sub: string };
  } catch {
    return null;
  }
}

export function signConnectToken(userId: string, secret: string, now = Date.now()) {
  return signToken("connect", { sub: userId }, secret, now);
}

/** Quem pode conectar, se a assinatura confere e o token não venceu; senão null. */
export async function verifyConnectToken(token: string, secret: string, now = Date.now()) {
  const claims = await readToken("connect", token, secret, now);
  return claims ? { userId: claims.sub } : null;
}

/** Entrada na sala de um quadro. O nome vai no token para os outros verem quem está ali. */
export function signBoardToken(
  input: { userId: string; boardId: string; name: string },
  secret: string,
  now = Date.now(),
) {
  return signToken("board", { sub: input.userId, board: input.boardId, name: input.name.slice(0, 80) }, secret, now);
}

export async function verifyBoardToken(token: string, secret: string, now = Date.now()) {
  const claims = await readToken("board", token, secret, now);
  if (!claims || typeof claims.board !== "string" || !claims.board || typeof claims.name !== "string") return null;
  return { userId: claims.sub, boardId: claims.board, name: claims.name };
}
