import { and, asc, desc, eq, inArray, isNull, lt, max, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { client, clientRequest, clientRequestDelivery, clientRequestDeliveryFile, media, portalUser } from "@/db/schema";

// Entregas para aprovação (rodadas de arquivos da equipe e a resposta do
// cliente). Sem "server-only": rodam também nos scripts contra PGlite. Do lado
// do portal, quem chama passa o clientId da sessão do contato; uma rodada de
// outro cliente "não existe".

/**
 * As rodadas da solicitação, da mais nova para a mais antiga, com os arquivos
 * na ordem em que foram mandados. Arquivo já tirado do servidor vem com
 * `media: null` (fica o nome copiado e a resposta do cliente).
 */
export async function listRequestDeliveries(database: Database, requestId: string) {
  const deliveries = await database
    .select()
    .from(clientRequestDelivery)
    .where(eq(clientRequestDelivery.requestId, requestId))
    .orderBy(desc(clientRequestDelivery.round));
  const files = deliveries.length
    ? await database
        .select({
          id: clientRequestDeliveryFile.id,
          deliveryId: clientRequestDeliveryFile.deliveryId,
          name: sql<string>`coalesce(${clientRequestDeliveryFile.name}, ${media.name}, 'arquivo')`,
          position: clientRequestDeliveryFile.position,
          decision: clientRequestDeliveryFile.decision,
          comment: clientRequestDeliveryFile.comment,
          decidedByName: clientRequestDeliveryFile.decidedByName,
          decidedAt: clientRequestDeliveryFile.decidedAt,
          media: { id: media.id, key: media.key, name: media.name, type: media.type, size: media.size },
        })
        .from(clientRequestDeliveryFile)
        .leftJoin(media, eq(media.id, clientRequestDeliveryFile.mediaId))
        .where(inArray(clientRequestDeliveryFile.deliveryId, deliveries.map((delivery) => delivery.id)))
        .orderBy(asc(clientRequestDeliveryFile.position))
    : [];
  return deliveries.map((delivery) => ({
    ...delivery,
    files: files
      .filter((file) => file.deliveryId === delivery.id)
      .map((file) => ({ ...file, media: file.media?.id ? file.media : null })),
  }));
}

export type RequestDeliveryItem = Awaited<ReturnType<typeof listRequestDeliveries>>[number];

const deliveryFields = {
  delivery: clientRequestDelivery,
  request: {
    id: clientRequest.id,
    number: clientRequest.number,
    title: clientRequest.title,
    status: clientRequest.status,
    clientId: clientRequest.clientId,
  },
  client: { id: client.id, name: client.name },
};

/** A rodada com a solicitação dela. Com `clientId` (portal), só se for desse cliente. */
export async function findRequestDelivery(database: Database, deliveryId: string, scope: { clientId?: string } = {}) {
  const [found] = await database
    .select(deliveryFields)
    .from(clientRequestDelivery)
    .innerJoin(clientRequest, eq(clientRequest.id, clientRequestDelivery.requestId))
    .innerJoin(client, eq(client.id, clientRequest.clientId))
    .where(and(eq(clientRequestDelivery.id, deliveryId), scope.clientId ? eq(clientRequest.clientId, scope.clientId) : undefined))
    .limit(1);
  return found ?? null;
}

export type RequestDeliveryFound = NonNullable<Awaited<ReturnType<typeof findRequestDelivery>>>;

/** Um arquivo de rodada, com a rodada e a solicitação (mesma regra de cliente). */
export async function findRequestDeliveryFile(database: Database, fileId: string, scope: { clientId?: string } = {}) {
  const [found] = await database
    .select({ file: clientRequestDeliveryFile, ...deliveryFields })
    .from(clientRequestDeliveryFile)
    .innerJoin(clientRequestDelivery, eq(clientRequestDelivery.id, clientRequestDeliveryFile.deliveryId))
    .innerJoin(clientRequest, eq(clientRequest.id, clientRequestDelivery.requestId))
    .innerJoin(client, eq(client.id, clientRequest.clientId))
    .where(and(eq(clientRequestDeliveryFile.id, fileId), scope.clientId ? eq(clientRequest.clientId, scope.clientId) : undefined))
    .limit(1);
  return found ?? null;
}

/** As respostas (rascunho ou não) de cada arquivo da rodada. */
export function listDeliveryDecisions(database: Database, deliveryId: string) {
  return database
    .select({ id: clientRequestDeliveryFile.id, decision: clientRequestDeliveryFile.decision })
    .from(clientRequestDeliveryFile)
    .where(eq(clientRequestDeliveryFile.deliveryId, deliveryId));
}

/** O número da próxima rodada (1 na primeira). */
export async function nextDeliveryRound(database: Database, requestId: string) {
  const [found] = await database
    .select({ last: max(clientRequestDelivery.round) })
    .from(clientRequestDelivery)
    .where(eq(clientRequestDelivery.requestId, requestId));
  return (found?.last ?? 0) + 1;
}

/** A rodada que espera resposta (no máximo uma por solicitação). */
export async function findPendingDelivery(database: Database, requestId: string) {
  const [found] = await database
    .select()
    .from(clientRequestDelivery)
    .where(and(eq(clientRequestDelivery.requestId, requestId), eq(clientRequestDelivery.status, "pending")))
    .limit(1);
  return found ?? null;
}

/** Chaves dos arquivos da rodada (para apagar do CDN ao retirar). */
export async function listDeliveryFileKeys(database: Database, deliveryId: string) {
  const rows = await database
    .select({ key: media.key })
    .from(clientRequestDeliveryFile)
    .innerJoin(media, eq(media.id, clientRequestDeliveryFile.mediaId))
    .where(eq(clientRequestDeliveryFile.deliveryId, deliveryId));
  return rows.map((row) => row.key);
}

/** Contatos ativos do cliente: quem recebe os avisos do portal (e, com `canApprove`, o e-mail de entrega). */
export function listActivePortalContacts(database: Database, clientId: string) {
  return database
    .select({ id: portalUser.id, name: portalUser.name, email: portalUser.email, canApprove: portalUser.canApprove })
    .from(portalUser)
    .where(and(eq(portalUser.clientId, clientId), isNull(portalUser.disabledAt)));
}

/** As rodadas que esperam a resposta do cliente (o "Para aprovar" do início do portal), as mais novas primeiro. */
export function listPendingDeliveriesOfClient(database: Database, clientId: string) {
  return database
    .select({
      id: clientRequestDelivery.id,
      round: clientRequestDelivery.round,
      sentAt: clientRequestDelivery.sentAt,
      sentByName: clientRequestDelivery.sentByName,
      files: sql<number>`(select count(*) from ${clientRequestDeliveryFile} where ${clientRequestDeliveryFile.deliveryId} = ${clientRequestDelivery.id})`.mapWith(
        Number,
      ),
      request: { number: clientRequest.number, title: clientRequest.title },
    })
    .from(clientRequestDelivery)
    .innerJoin(clientRequest, eq(clientRequest.id, clientRequestDelivery.requestId))
    .where(and(eq(clientRequest.clientId, clientId), eq(clientRequestDelivery.status, "pending")))
    .orderBy(desc(clientRequestDelivery.sentAt));
}

/**
 * Até `limit` arquivos de cada rodada (na ordem do envio), para as miniaturas
 * do card "Para aprovar" do início do portal. Quem chama já filtrou as rodadas
 * pelo cliente (listPendingDeliveriesOfClient).
 */
export async function listDeliveryFilePreviews(database: Database, deliveryIds: string[], limit: number) {
  const map = new Map<string, { id: string; name: string; key: string; type: string }[]>();
  if (deliveryIds.length === 0) return map;
  const rows = await database
    .select({
      deliveryId: clientRequestDeliveryFile.deliveryId,
      id: clientRequestDeliveryFile.id,
      name: sql<string>`coalesce(${clientRequestDeliveryFile.name}, ${media.name})`,
      key: media.key,
      type: media.type,
    })
    .from(clientRequestDeliveryFile)
    .innerJoin(media, eq(media.id, clientRequestDeliveryFile.mediaId))
    .where(inArray(clientRequestDeliveryFile.deliveryId, deliveryIds))
    .orderBy(asc(clientRequestDeliveryFile.position));
  for (const { deliveryId, ...file } of rows) {
    const list = map.get(deliveryId) ?? [];
    if (list.length < limit) list.push(file);
    map.set(deliveryId, list);
  }
  return map;
}

/**
 * Rodadas anteriores a `round` que não foram aprovadas (substituídas ou com
 * alterações pedidas) e ainda têm arquivo no servidor, com as chaves deles: o
 * que sai ao "excluir os arquivos das rodadas anteriores" depois de uma
 * aprovada. As rodadas em si ficam (histórico).
 */
export async function listRemovableDeliveryFiles(database: Database, requestId: string, round: number) {
  const rows = await database
    .select({ deliveryId: clientRequestDeliveryFile.deliveryId, round: clientRequestDelivery.round, key: media.key })
    .from(clientRequestDeliveryFile)
    .innerJoin(clientRequestDelivery, eq(clientRequestDelivery.id, clientRequestDeliveryFile.deliveryId))
    .innerJoin(media, eq(media.id, clientRequestDeliveryFile.mediaId))
    .where(
      and(
        eq(clientRequestDelivery.requestId, requestId),
        lt(clientRequestDelivery.round, round),
        inArray(clientRequestDelivery.status, ["superseded", "changes_requested"]),
      ),
    )
    .orderBy(asc(clientRequestDelivery.round));
  const deliveries = new Map<string, number>();
  for (const row of rows) deliveries.set(row.deliveryId, row.round);
  return {
    deliveries: [...deliveries].map(([id, round]) => ({ id, round })),
    keys: rows.map((row) => row.key),
  };
}
