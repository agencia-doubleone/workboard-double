import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { PORTAL_SIGN_IN_PATH } from "@/lib/portal";
import { portalAuth } from "@/lib/portal-auth";
import { canUsePortal, findPortalContact, type PortalContactRecord } from "@/server/portal";

/**
 * Sessão do portal do cliente (deduplicada por request), com o contato e o
 * cliente dele. Só vale com o contato ativo e o cliente não arquivado: a
 * conferência é a cada request, não só no login. Dentro de <Suspense>, como a
 * sessão da equipe (src/lib/session.ts); o connection() para o prefetch ali.
 *
 * O clientId de qualquer consulta do portal sai daqui, nunca de parâmetro,
 * formulário ou URL.
 */
export const getPortalSession = cache(async (): Promise<PortalContactRecord | null> => {
  await connection();
  const session = await portalAuth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const found = await findPortalContact(db, session.user.id);
  return canUsePortal(found) ? found : null;
});

export async function requirePortalSession() {
  const found = await getPortalSession();
  if (!found) redirect(PORTAL_SIGN_IN_PATH);
  return found;
}
