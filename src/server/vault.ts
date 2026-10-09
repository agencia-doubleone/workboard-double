import "server-only";

import { env } from "@/env";
import { decryptWithKey, encryptWithKey } from "./vault-crypto";

// Cofre de senhas dos clientes. A chave vem de VAULT_ENCRYPTION_KEY; sem ela,
// o cofre fica desligado (a página mostra o aviso). Trocar a chave deixa as
// senhas já salvas ilegíveis: não há rotação automática.

function getKey() {
  if (!env.VAULT_ENCRYPTION_KEY) throw new Error("VAULT_ENCRYPTION_KEY não configurada.");
  return Buffer.from(env.VAULT_ENCRYPTION_KEY, "base64");
}

export function isVaultConfigured() {
  return Boolean(env.VAULT_ENCRYPTION_KEY);
}

/** Cifra um segredo de um acesso; `credentialId` amarra o texto cifrado ao registro. */
export function encryptSecret(plaintext: string, credentialId: string) {
  return encryptWithKey(getKey(), plaintext, credentialId);
}

export function decryptSecret(payload: string, credentialId: string) {
  return decryptWithKey(getKey(), payload, credentialId);
}
