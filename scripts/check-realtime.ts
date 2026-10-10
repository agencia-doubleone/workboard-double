// Verifica o tempo real de ponta a ponta (npm run realtime:check): conecta no
// Worker como uma pessoa de teste, publica um evento para ela, confere que
// chegou e as proteções, e a sala do quadro branco. Não usa o banco nem o
// navegador; só REALTIME_URL, REALTIME_SECRET e BETTER_AUTH_URL (a origem que
// o Worker precisa aceitar).

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { env } from "@/env";
import { CLOSE_REVOKED, PING, PONG, signBoardToken, signConnectToken } from "@/lib/realtime/protocol";

let failures = 0;

function check(ok: boolean, label: string, detail?: unknown) {
  console.log(`${ok ? "✔" : "✖"} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`    ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Status da abertura do websocket (101 = aceito), para explicar uma recusa. */
function upgradeStatus(url: string, origin: string) {
  return new Promise<number>((resolve, reject) => {
    const request = (url.startsWith("https") ? httpsRequest : httpRequest)(url, {
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        Origin: origin,
      },
    });
    request.on("response", (response) => {
      resolve(response.statusCode ?? 0);
      response.resume();
    });
    request.on("upgrade", (_response, socket) => {
      resolve(101);
      socket.destroy();
    });
    request.on("error", reject);
    request.setTimeout(10_000, () => request.destroy(new Error("sem resposta em 10 s")));
    request.end();
  });
}

const CONNECT_HINTS: Record<number, string> = {
  401: "Token recusado: o REALTIME_SECRET do .env.local é diferente do segredo gravado no Worker.",
  403: "Origem recusada: inclua a origem do app em ALLOWED_ORIGINS (realtime/wrangler.jsonc) e publique de novo.",
  404: "Endereço errado: confira o REALTIME_URL (sem /connect no fim).",
};

async function main() {
  if (!env.REALTIME_URL || !env.REALTIME_SECRET) {
    throw new Error("Defina REALTIME_URL e REALTIME_SECRET no .env.local (veja realtime/README.md).");
  }
  const base = env.REALTIME_URL;
  const secret = env.REALTIME_SECRET;
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  console.log(`Worker: ${base}\nOrigem do app: ${origin}\n`);

  const home = await fetch(base).catch((error: unknown) => error as Error);
  if (home instanceof Error) throw new Error(`O Worker não respondeu em ${base}: ${home.message}`);
  check(home.status === 200, "o Worker está no ar", `status ${home.status}: ${(await home.text()).slice(0, 200)}`);

  const publish = (body: unknown, key = secret) =>
    fetch(`${base}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const wrongSecret = await publish({ to: ["ninguem"], event: { type: "notifications.read" } }, `${secret}-errado`);
  check(wrongSecret.status === 401, "segredo errado é recusado no /publish", `status ${wrongSecret.status}`);

  // Pessoa de teste (id aleatório): ninguém de verdade recebe nada.
  const userId = `check-${crypto.randomUUID().slice(0, 8)}`;
  const connectUrl = `${base.replace(/^http/, "ws")}/connect?token=${encodeURIComponent(await signConnectToken(userId, secret))}`;
  const status = await upgradeStatus(connectUrl.replace(/^ws/, "http"), origin);
  check(status === 101, "o navegador consegue abrir o websocket (token e origem aceitos)", CONNECT_HINTS[status] ?? `status ${status}`);
  if (status !== 101) return finish();

  const expired = await signConnectToken(userId, secret, Date.now() - 5 * 60_000);
  const expiredStatus = await upgradeStatus(`${base}/connect?token=${encodeURIComponent(expired)}`, origin);
  check(expiredStatus === 401, "token vencido é recusado", `status ${expiredStatus}`);

  const strangerStatus = await upgradeStatus(connectUrl.replace(/^ws/, "http"), "https://site-estranho.example");
  check(strangerStatus === 403, "outra origem é recusada", `status ${strangerStatus} (ALLOWED_ORIGINS vazio aceita qualquer site)`);

  const received: unknown[] = [];
  const socket = new WebSocket(connectUrl, { headers: { Origin: origin } } as never);
  const closed = new Promise<number>((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  socket.addEventListener("message", (event) => received.push(event.data === PONG ? PONG : JSON.parse(String(event.data))));
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("o websocket não abriu")));
  });

  const sent = await publish({ to: [userId], event: { type: "notifications.read" } });
  const sentBody = (await sent.json().catch(() => null)) as { delivered?: number } | null;
  check(sent.status === 200 && sentBody?.delivered === 1, "o /publish entrega para a conexão aberta", sentBody ?? `status ${sent.status}`);
  socket.send(PING);
  await wait(1_500);
  check(
    received.some((item) => typeof item === "object" && item !== null && (item as { type?: string }).type === "notifications.read"),
    "o evento chega pelo websocket",
    received,
  );
  check(received.includes(PONG), "o batimento (ping/pong) responde", received);

  const disconnect = await fetch(`${base}/disconnect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: [userId] }),
  });
  const code = await Promise.race([closed, wait(5_000).then(() => 0)]);
  check(disconnect.status === 200 && code === CLOSE_REVOKED, "o /disconnect derruba a conexão", { status: disconnect.status, code });
  if (socket.readyState === WebSocket.OPEN) socket.close();

  await checkBoardRoom({ base, secret, origin, publish });
  finish();
}

type Received = { type?: string; [key: string]: unknown };

async function openSocket(url: string, origin: string) {
  const received: Received[] = [];
  const socket = new WebSocket(url, { headers: { Origin: origin } } as never);
  const closed = new Promise<number>((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  socket.addEventListener("message", (event) => {
    if (event.data !== PONG) received.push(JSON.parse(String(event.data)) as Received);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("o websocket da sala não abriu")));
  });
  // Como o navegador: um batimento logo ao abrir.
  socket.send(PING);
  return { socket, received, closed };
}

/** Sala do quadro branco (/board): entrada, presença, cursores, elementos e fechamento. */
async function checkBoardRoom({
  base,
  secret,
  origin,
  publish,
}: {
  base: string;
  secret: string;
  origin: string;
  publish: (body: unknown) => Promise<Response>;
}) {
  console.log("\nSala do quadro branco");
  const boardId = `check-${crypto.randomUUID()}`;
  const [firstUser, secondUser] = [`check-${crypto.randomUUID().slice(0, 8)}`, `check-${crypto.randomUUID().slice(0, 8)}`];
  const boardUrl = async (userId: string, name: string) =>
    `${base.replace(/^http/, "ws")}/board?token=${encodeURIComponent(await signBoardToken({ userId, boardId, name }, secret))}`;

  const status = await upgradeStatus((await boardUrl(firstUser, "Primeira")).replace(/^ws/, "http"), origin);
  check(
    status === 101,
    "a sala do quadro abre",
    status === 404 ? "O Worker publicado é anterior aos quadros: cd realtime && npm run deploy." : (CONNECT_HINTS[status] ?? `status ${status}`),
  );
  if (status !== 101) return;
  const wrongToken = await upgradeStatus(`${base}/board?token=${encodeURIComponent(await signConnectToken(firstUser, secret))}`, origin);
  check(wrongToken === 401, "o token comum não abre a sala", `status ${wrongToken}`);

  const first = await openSocket(await boardUrl(firstUser, "Primeira"), origin);
  const second = await openSocket(await boardUrl(secondUser, "Segunda"), origin);
  await wait(1_000);
  const welcome = second.received.find((message) => message.type === "welcome") as
    | { session: string; peers: { name: string; session: string }[] }
    | undefined;
  check(welcome?.peers.some((peer) => peer.name === "Primeira") === true, "quem entra vê quem já está na sala", second.received);
  const firstSession = (first.received.find((message) => message.type === "welcome") as { session?: string } | undefined)?.session;
  check(
    first.received.some((message) => message.type === "joined" && (message.peer as { name?: string })?.name === "Segunda"),
    "quem já está vê quem entrou",
    first.received,
  );

  first.socket.send(JSON.stringify({ type: "pointer", x: 10, y: 20, tool: "pointer", button: "up", selected: ["a"] }));
  first.socket.send(JSON.stringify({ type: "elements", elements: [{ id: "e1", type: "rectangle", version: 1 }] }));
  await wait(1_000);
  check(
    second.received.some((message) => message.type === "pointer" && message.from === firstSession && message.x === 10),
    "o cursor chega aos outros",
    second.received,
  );
  check(
    second.received.some((message) => message.type === "elements" && message.from === firstSession),
    "os elementos chegam aos outros",
    second.received,
  );
  check(
    !first.received.some((message) => message.type === "pointer" || message.type === "elements"),
    "quem mandou não recebe de volta",
    first.received,
  );

  const sent = await publish({ to: [secondUser], event: { type: "notifications.read" } });
  const sentBody = (await sent.json().catch(() => null)) as { delivered?: number } | null;
  check(sentBody?.delivered === 0, "avisos não vão para a sala do quadro", sentBody);

  const closeRoom = await fetch(`${base}/board/disconnect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ boardId }),
  });
  const codes = await Promise.all([first.closed, second.closed].map((closed) => Promise.race([closed, wait(5_000).then(() => 0)])));
  check(
    closeRoom.status === 200 && codes.every((code) => code === CLOSE_REVOKED),
    "o /board/disconnect fecha a sala",
    { status: closeRoom.status, codes },
  );
}

function finish() {
  if (failures > 0) {
    console.log(`\n✖ ${failures} verificação(ões) falharam. Veja "Problemas comuns" em realtime/README.md.`);
    process.exit(1);
  }
  console.log("\n✔ Tempo real pronto para uso.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("✖ Falha na verificação:", error instanceof Error ? error.message : error);
  process.exit(1);
});
