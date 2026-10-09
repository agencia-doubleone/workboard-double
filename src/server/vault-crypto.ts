import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifra do cofre de senhas: AES-256-GCM. Formato guardado no banco:
//   v1.<iv>.<tag>.<texto cifrado>   (base64url)
// `context` entra como dado autenticado (AAD): o id do acesso. Assim um texto
// cifrado copiado para outro registro não decifra. Sem "server-only" só para
// poder ser testado fora do Next; use pelo src/server/vault.ts.

const VERSION = "v1";
const IV_BYTES = 12;

export function encryptWithKey(key: Buffer, plaintext: string, context: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, encrypted].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Lança erro se o texto foi alterado, se a chave é outra ou se o contexto não bate. */
export function decryptWithKey(key: Buffer, payload: string, context: string) {
  const [version, iv, tag, encrypted] = payload.split(".");
  if (version !== VERSION || !iv || !tag || encrypted === undefined) {
    throw new Error("Formato de segredo desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
