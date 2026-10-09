import { and, asc, count, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { client, clientCredential } from "@/db/schema";
import { slugify } from "@/lib/slug";

export type ClientRecord = typeof client.$inferSelect;

// Ordem alfabética em português (Ótica junto do O, sem separar maiúsculas):
// a ordenação do Postgres depende da collation do banco, então é feita aqui.
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
export type CredentialRecord = typeof clientCredential.$inferSelect;

/** Clientes ativos (ou só os arquivados), em ordem alfabética, com o total de acessos no cofre. */
export async function listClients(database: Database, { archived = false } = {}) {
  const credentials = database
    .select({ clientId: clientCredential.clientId, total: count().as("credential_count") })
    .from(clientCredential)
    .groupBy(clientCredential.clientId)
    .as("credentials");

  const rows = await database
    .select({
      id: client.id,
      name: client.name,
      slug: client.slug,
      logoKey: client.logoKey,
      website: client.website,
      instagram: client.instagram,
      facebook: client.facebook,
      linkedin: client.linkedin,
      youtube: client.youtube,
      ageMin: client.ageMin,
      ageMax: client.ageMax,
      genders: client.genders,
      socialClasses: client.socialClasses,
      archivedAt: client.archivedAt,
      updatedAt: client.updatedAt,
      credentialCount: credentials.total,
    })
    .from(client)
    .leftJoin(credentials, eq(credentials.clientId, client.id))
    .where(archived ? isNotNull(client.archivedAt) : isNull(client.archivedAt));
  return rows.sort((a, b) => collator.compare(a.name, b.name));
}

export type ClientListItem = Awaited<ReturnType<typeof listClients>>[number];

export async function countArchivedClients(database: Database) {
  const [{ total }] = await database
    .select({ total: count() })
    .from(client)
    .where(isNotNull(client.archivedAt));
  return total;
}

export async function findClientBySlug(database: Database, slug: string) {
  const [found] = await database.select().from(client).where(eq(client.slug, slug)).limit(1);
  return found ?? null;
}

export async function findClientById(database: Database, id: string) {
  const [found] = await database.select().from(client).where(eq(client.id, id)).limit(1);
  return found ?? null;
}

/** Slug livre a partir do nome: "padaria-sao-joao", "padaria-sao-joao-2"... */
export async function generateClientSlug(database: Database, name: string) {
  const base = slugify(name) || "cliente";
  const taken = await database
    .select({ slug: client.slug })
    .from(client)
    .where(or(eq(client.slug, base), like(client.slug, `${base}-%`)));
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Acessos do cofre sem os segredos (nunca saem cifrados para o navegador). */
export async function listCredentials(database: Database, clientId: string) {
  const rows = await database
    .select({
      id: clientCredential.id,
      service: clientCredential.service,
      url: clientCredential.url,
      username: clientCredential.username,
      hasNotes: sql<boolean>`${clientCredential.notesEncrypted} is not null`,
      updatedAt: clientCredential.updatedAt,
    })
    .from(clientCredential)
    .where(eq(clientCredential.clientId, clientId))
    .orderBy(asc(clientCredential.createdAt));
  return rows.sort((a, b) => collator.compare(a.service, b.service));
}

export type CredentialListItem = Awaited<ReturnType<typeof listCredentials>>[number];

export async function findCredentialById(database: Database, id: string) {
  const [found] = await database
    .select({ credential: clientCredential, client: { id: client.id, name: client.name, slug: client.slug, archivedAt: client.archivedAt } })
    .from(clientCredential)
    .innerJoin(client, eq(client.id, clientCredential.clientId))
    .where(eq(clientCredential.id, id))
    .limit(1);
  return found ?? null;
}

export async function findActiveClientById(database: Database, id: string) {
  const [found] = await database
    .select()
    .from(client)
    .where(and(eq(client.id, id), isNull(client.archivedAt)))
    .limit(1);
  return found ?? null;
}
