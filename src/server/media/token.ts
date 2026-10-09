import { createHmac, timingSafeEqual } from "node:crypto";

// Tokens trocados com o cdn/*.php: "<payload>.<assinatura>", ambos em
// base64url sem padding. A assinatura é HMAC-SHA256 de "<finalidade>.<payload>"
// com o segredo compartilhado; a finalidade impede usar um recibo como
// autorização de envio (e vice-versa). O PHP implementa o mesmo formato em
// cdn/lib.php: mudou aqui, mude lá.
//
// Sem "server-only": funções puras, testáveis fora do Next. O segredo vem
// sempre por parâmetro.

export const MEDIA_TOKEN_VERSION = 1;

export type MediaTokenPurpose = "upload" | "receipt" | "delete";

function hmac(purpose: MediaTokenPurpose, body: string, secret: string) {
  return createHmac("sha256", secret).update(`${purpose}.${body}`).digest();
}

export function signMediaToken(
  purpose: MediaTokenPurpose,
  payload: Record<string, unknown>,
  secret: string,
) {
  const body = Buffer.from(
    JSON.stringify({ v: MEDIA_TOKEN_VERSION, ...payload }),
  ).toString("base64url");
  return `${body}.${hmac(purpose, body, secret).toString("base64url")}`;
}

/** O payload, se a assinatura e a versão conferem; senão null. Não checa validade. */
export function verifyMediaToken(
  purpose: MediaTokenPurpose,
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = hmac(purpose, body, secret);
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    return record.v === MEDIA_TOKEN_VERSION ? record : null;
  } catch {
    return null;
  }
}
