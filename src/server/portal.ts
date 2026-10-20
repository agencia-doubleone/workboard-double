import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { client, portalSession, portalUser } from "@/db/schema";

// Consultas do portal do cliente (sem "server-only": também rodam nos scripts
// de verificação contra PGlite e na config do Better Auth do portal).

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

const contactFields = {
  id: portalUser.id,
  name: portalUser.name,
  email: portalUser.email,
  /** Foto do perfil: chave do CDN (pasta "portal"), como user.image. */
  image: portalUser.image,
  clientId: portalUser.clientId,
  canApprove: portalUser.canApprove,
  disabledAt: portalUser.disabledAt,
  lastSignInAt: portalUser.lastSignInAt,
  invitedAt: portalUser.invitedAt,
  createdAt: portalUser.createdAt,
};

const clientFields = {
  id: client.id,
  name: client.name,
  slug: client.slug,
  logoKey: client.logoKey,
  /** Aniversário da empresa: a saudação do portal comemora (como o aniversário da pessoa na equipe). */
  foundedOn: client.foundedOn,
  archivedAt: client.archivedAt,
};

export type PortalContactRecord = {
  contact: { [K in keyof typeof contactFields]: (typeof portalUser.$inferSelect)[K] };
  client: { [K in keyof typeof clientFields]: (typeof client.$inferSelect)[K] };
};

/** Um contato com o cliente dele. */
export async function findPortalContact(database: Database, id: string): Promise<PortalContactRecord | null> {
  const [found] = await database
    .select({ contact: contactFields, client: clientFields })
    .from(portalUser)
    .innerJoin(client, eq(client.id, portalUser.clientId))
    .where(eq(portalUser.id, id))
    .limit(1);
  return found ?? null;
}

export async function findPortalContactByEmail(database: Database, email: string): Promise<PortalContactRecord | null> {
  const [found] = await database
    .select({ contact: contactFields, client: clientFields })
    .from(portalUser)
    .innerJoin(client, eq(client.id, portalUser.clientId))
    .where(eq(portalUser.email, email.trim().toLowerCase()))
    .limit(1);
  return found ?? null;
}

/**
 * Quem pode usar o portal: contato ativo de um cliente que não está arquivado.
 * Vale ao mandar o código e em toda página (src/lib/portal-session.ts).
 */
export function canUsePortal(found: Pick<PortalContactRecord, "contact" | "client"> | null) {
  return Boolean(found && !found.contact.disabledAt && !found.client.archivedAt);
}

/** Os contatos de um cliente, em ordem de nome (página do cliente, só admins). */
export async function listPortalContacts(database: Database, clientId: string) {
  const rows = await database.select(contactFields).from(portalUser).where(eq(portalUser.clientId, clientId));
  return rows.sort((a, b) => collator.compare(a.name, b.name));
}

export type PortalContactItem = Awaited<ReturnType<typeof listPortalContacts>>[number];

/** Encerra as sessões abertas de um contato (ao desativar). */
export async function revokePortalSessions(database: Database, contactId: string) {
  await database.delete(portalSession).where(eq(portalSession.userId, contactId));
}
