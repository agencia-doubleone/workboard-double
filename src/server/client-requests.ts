import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type Column, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import {
  client,
  clientRequest,
  clientRequestDelivery,
  clientRequestDeliveryFile,
  clientRequestEvent,
  clientRequestMessage,
  clientRequestMessageAttachment,
  clientRequestPortalRead,
  clientRequestRead,
  clientRequestStatusHistory,
  job,
  media,
  portalUser,
  user,
} from "@/db/schema";
import {
  DEFAULT_REQUEST_PAGE_SIZE,
  type DeliveryStatus,
  type RequestSide,
  requestNumberInQuery,
  statusesOfSituation,
  type RequestSituation,
  type RequestStatus,
} from "@/lib/client-requests";

// Consultas das solicitações (sem "server-only": rodam também nos scripts de
// verificação contra PGlite). Do lado do portal, o clientId vem SEMPRE da
// sessão do contato (getPortalSession): toda consulta do portal recebe e filtra
// por ele. Do lado da equipe, quem chama já conferiu que é admin.

export type ClientRequestRecord = typeof clientRequest.$inferSelect;

/**
 * Quem está vendo, para contar novidades e não lidas: da equipe (userId) ou um
 * contato do portal (portalUserId). `since`: o que veio antes disso nunca é
 * novidade para ela (quem entrou depois não vê o passado como não lido); é a
 * data de cadastro da pessoa.
 */
export type RequestViewer =
  | { kind: "team"; userId: string; since: Date }
  | { kind: "portal"; portalUserId: string; clientId: string; since: Date };

/** Último "visto" da pessoa na solicitação (ou o `since`, se nunca abriu). */
function readMark(viewer: RequestViewer) {
  return viewer.kind === "team"
    ? sql`coalesce((select ${clientRequestRead.lastReadAt} from ${clientRequestRead} where ${clientRequestRead.requestId} = ${clientRequest.id} and ${clientRequestRead.userId} = ${viewer.userId}), ${viewer.since.toISOString()}::timestamptz)`
    : sql`coalesce((select ${clientRequestPortalRead.lastReadAt} from ${clientRequestPortalRead} where ${clientRequestPortalRead.requestId} = ${clientRequest.id} and ${clientRequestPortalRead.portalUserId} = ${viewer.portalUserId}), ${viewer.since.toISOString()}::timestamptz)`;
}

/** A mensagem não é de quem está vendo. */
function notMine(viewer: RequestViewer) {
  return viewer.kind === "team"
    ? sql`${clientRequestMessage.authorId} is distinct from ${viewer.userId}`
    : sql`${clientRequestMessage.authorPortalUserId} is distinct from ${viewer.portalUserId}`;
}

/** Mensagens da solicitação que quem vê ainda não leu (de outras pessoas, depois do último "visto"). */
function unreadMessagesSql(viewer: RequestViewer) {
  return sql<number>`(select count(*) from ${clientRequestMessage} where ${clientRequestMessage.requestId} = ${clientRequest.id} and ${clientRequestMessage.createdAt} > ${readMark(viewer)} and ${notMine(viewer)})`.mapWith(
    Number,
  );
}

/** Equipe: a solicitação chegou depois do último "visto" (nunca aberta por essa pessoa). */
function isNewSql(viewer: RequestViewer) {
  if (viewer.kind === "portal") return sql<boolean>`false`;
  return sql<boolean>`(${clientRequest.createdAt} > ${readMark(viewer)})`;
}

export type RequestListFilters = {
  viewer: RequestViewer;
  situation: RequestSituation;
  status?: RequestStatus;
  /** Só na tela da equipe; no portal vale o cliente do contato. */
  clientId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listClientRequests(database: Database, filters: RequestListFilters) {
  const pageSize = filters.pageSize ?? DEFAULT_REQUEST_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const { viewer } = filters;
  const conditions: SQL[] = [inArray(clientRequest.status, statusesOfSituation(filters.situation))];
  if (viewer.kind === "portal") conditions.push(eq(clientRequest.clientId, viewer.clientId));
  else if (filters.clientId) conditions.push(eq(clientRequest.clientId, filters.clientId));
  if (filters.status) conditions.push(eq(clientRequest.status, filters.status));
  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const fields = [ilike(clientRequest.title, pattern)];
    if (viewer.kind === "team") fields.push(ilike(client.name, pattern));
    const byText = or(...fields)!;
    // "12" ou "S-12" acham pelo número.
    const number = requestNumberInQuery(search);
    conditions.push(number !== null ? or(byText, eq(clientRequest.number, number))! : byText);
  }
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    database
      .select({
        id: clientRequest.id,
        number: clientRequest.number,
        title: clientRequest.title,
        status: clientRequest.status,
        expectedOn: clientRequest.expectedOn,
        hasBriefing: sql<boolean>`(${clientRequest.briefing} <> '')`,
        // Uma rodada espera a resposta do cliente ("Para aprovar" no portal).
        pendingDelivery: sql<boolean>`exists (select 1 from ${clientRequestDelivery} where ${clientRequestDelivery.requestId} = ${clientRequest.id} and ${clientRequestDelivery.status} = 'pending')`,
        createdBySide: clientRequest.createdBySide,
        createdByName: clientRequest.createdByName,
        createdAt: clientRequest.createdAt,
        client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey },
        messageTotal: sql<number>`(select count(*) from ${clientRequestMessage} where ${clientRequestMessage.requestId} = ${clientRequest.id})`.mapWith(
          Number,
        ),
        messageUnread: unreadMessagesSql(viewer),
        isNew: isNewSql(viewer),
      })
      .from(clientRequest)
      .innerJoin(client, eq(client.id, clientRequest.clientId))
      .where(where)
      .orderBy(desc(clientRequest.number))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database
      .select({ total: count() })
      .from(clientRequest)
      .innerJoin(client, eq(client.id, clientRequest.clientId))
      .where(where),
  ]);

  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export type ClientRequestListItem = Awaited<ReturnType<typeof listClientRequests>>["rows"][number];

/**
 * Equipe: quantas solicitações têm novidade para a pessoa (chegaram ou têm
 * mensagem de outra pessoa depois do último "visto"). É o número ao lado de
 * "Solicitações" no menu.
 */
export async function countRequestsWithNews(database: Database, viewer: Extract<RequestViewer, { kind: "team" }>) {
  const [{ total }] = await database
    .select({ total: count() })
    .from(clientRequest)
    .where(sql`(${isNewSql(viewer)} or ${unreadMessagesSql(viewer)} > 0)`);
  return total;
}

/** A solicitação tem novidade para quem está vendo (para saber se o menu precisa recontar ao abrir). */
export async function hasRequestNews(database: Database, requestId: string, viewer: RequestViewer) {
  const [found] = await database
    .select({ news: sql<boolean>`(${isNewSql(viewer)} or ${unreadMessagesSql(viewer)} > 0)` })
    .from(clientRequest)
    .where(eq(clientRequest.id, requestId))
    .limit(1);
  return Boolean(found?.news);
}

/**
 * Equipe (o Início dos admins): as solicitações em aberto, mais as encerradas
 * com mensagem não lida, com o que serve para saber o que pede atenção: a
 * última rodada (respondida pelo cliente?), a última mensagem, se é nova para
 * quem vê e quantos trabalhos saíram dela.
 */
export async function listRequestsOverview(database: Database, viewer: Extract<RequestViewer, { kind: "team" }>) {
  const unread = unreadMessagesSql(viewer);
  const lastDelivery = (column: Column) =>
    sql`(select ${column} from ${clientRequestDelivery} where ${clientRequestDelivery.requestId} = ${clientRequest.id} order by ${clientRequestDelivery.round} desc limit 1)`;
  const lastMessage = (column: Column) =>
    sql`(select ${column} from ${clientRequestMessage} where ${clientRequestMessage.requestId} = ${clientRequest.id} order by ${clientRequestMessage.createdAt} desc limit 1)`;

  return database
    .select({
      id: clientRequest.id,
      number: clientRequest.number,
      title: clientRequest.title,
      status: clientRequest.status,
      expectedOn: clientRequest.expectedOn,
      createdAt: clientRequest.createdAt,
      client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey },
      isNew: isNewSql(viewer),
      unread,
      lastDelivery: {
        round: lastDelivery(clientRequestDelivery.round).mapWith(clientRequestDelivery.round),
        status: sql<DeliveryStatus | null>`${lastDelivery(clientRequestDelivery.status)}`,
        answeredAt: lastDelivery(clientRequestDelivery.answeredAt).mapWith(clientRequestDelivery.answeredAt),
      },
      lastMessage: {
        body: sql<string | null>`${lastMessage(clientRequestMessage.body)}`,
        authorName: sql<string | null>`${lastMessage(clientRequestMessage.authorName)}`,
        authorSide: sql<RequestSide | null>`${lastMessage(clientRequestMessage.authorSide)}`,
      },
      jobs: sql<number>`(select count(*) from ${job} where ${job.clientRequestId} = ${clientRequest.id})`.mapWith(Number),
    })
    .from(clientRequest)
    .innerJoin(client, eq(client.id, clientRequest.clientId))
    .where(or(inArray(clientRequest.status, statusesOfSituation("abertas")), sql`${unread} > 0`))
    .orderBy(desc(clientRequest.number));
}

/**
 * Portal (os números do início): quantas solicitações o cliente tem. Com
 * `status` e `since`, só as que estão nesse status e chegaram nele desde então.
 */
export async function countClientRequests(
  database: Database,
  clientId: string,
  filter: { status?: RequestStatus; since?: Date } = {},
) {
  const [{ total }] = await database
    .select({ total: count() })
    .from(clientRequest)
    .where(
      and(
        eq(clientRequest.clientId, clientId),
        filter.status ? eq(clientRequest.status, filter.status) : undefined,
        filter.since ? sql`${clientRequest.statusChangedAt} >= ${filter.since.toISOString()}::timestamptz` : undefined,
      ),
    );
  return total;
}

export type RequestOverviewItem = Awaited<ReturnType<typeof listRequestsOverview>>[number];

// Uma solicitação

const requestFields = {
  request: clientRequest,
  client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey, archivedAt: client.archivedAt },
};

/**
 * Pelo número. Com `clientId` (portal), só se for desse cliente: a de outro
 * cliente "não existe" (404), mesmo acertando o número.
 */
export async function findClientRequestByNumber(database: Database, number: number, scope: { clientId?: string } = {}) {
  const [found] = await database
    .select(requestFields)
    .from(clientRequest)
    .innerJoin(client, eq(client.id, clientRequest.clientId))
    .where(and(eq(clientRequest.number, number), scope.clientId ? eq(clientRequest.clientId, scope.clientId) : undefined))
    .limit(1);
  return found ?? null;
}

/** Pelo id, com a mesma regra do cliente de findClientRequestByNumber. */
export async function findClientRequestById(database: Database, id: string, scope: { clientId?: string } = {}) {
  const [found] = await database
    .select(requestFields)
    .from(clientRequest)
    .innerJoin(client, eq(client.id, clientRequest.clientId))
    .where(and(eq(clientRequest.id, id), scope.clientId ? eq(clientRequest.clientId, scope.clientId) : undefined))
    .limit(1);
  return found ?? null;
}

export type ClientRequestFound = NonNullable<Awaited<ReturnType<typeof findClientRequestById>>>;

export function listClientRequestStatusHistory(database: Database, requestId: string) {
  return database
    .select()
    .from(clientRequestStatusHistory)
    .where(eq(clientRequestStatusHistory.requestId, requestId))
    .orderBy(desc(clientRequestStatusHistory.changedAt));
}

/** O resto do andamento (previsão, edições), do mais recente para o mais antigo. */
export function listClientRequestEvents(database: Database, requestId: string) {
  return database
    .select()
    .from(clientRequestEvent)
    .where(eq(clientRequestEvent.requestId, requestId))
    .orderBy(desc(clientRequestEvent.createdAt));
}

/**
 * O cliente já participou: abriu a solicitação pelo portal ou escreveu na
 * conversa. Aí ela não muda mais de cliente (o que ele escreveu iria parar no
 * portal de outra empresa).
 */
export async function hasClientParticipation(database: Database, request: Pick<ClientRequestRecord, "id" | "createdBySide">) {
  if (request.createdBySide === "client") return true;
  const [found] = await database
    .select({ id: clientRequestMessage.id })
    .from(clientRequestMessage)
    .where(and(eq(clientRequestMessage.requestId, request.id), eq(clientRequestMessage.authorSide, "client")))
    .limit(1);
  return Boolean(found);
}

/** A conversa, da mais antiga para a mais nova, com a foto de quem escreveu (equipe ou contato) e os anexos. */
export async function listClientRequestMessages(database: Database, requestId: string) {
  const rows = await database
    .select({
      id: clientRequestMessage.id,
      authorSide: clientRequestMessage.authorSide,
      authorId: clientRequestMessage.authorId,
      authorPortalUserId: clientRequestMessage.authorPortalUserId,
      authorName: clientRequestMessage.authorName,
      authorImage: sql<string | null>`coalesce(${user.image}, ${portalUser.image})`,
      body: clientRequestMessage.body,
      createdAt: clientRequestMessage.createdAt,
    })
    .from(clientRequestMessage)
    .leftJoin(user, eq(user.id, clientRequestMessage.authorId))
    .leftJoin(portalUser, eq(portalUser.id, clientRequestMessage.authorPortalUserId))
    .where(eq(clientRequestMessage.requestId, requestId))
    .orderBy(asc(clientRequestMessage.createdAt));
  const attachments = rows.length
    ? await database
        .select({
          messageId: clientRequestMessageAttachment.messageId,
          id: media.id,
          key: media.key,
          name: media.name,
          type: media.type,
          size: media.size,
        })
        .from(clientRequestMessageAttachment)
        .innerJoin(media, eq(media.id, clientRequestMessageAttachment.mediaId))
        .where(inArray(clientRequestMessageAttachment.messageId, rows.map((row) => row.id)))
    : [];
  return rows.map((row) => ({ ...row, attachments: attachments.filter((item) => item.messageId === row.id) }));
}

export type ClientRequestMessageItem = Awaited<ReturnType<typeof listClientRequestMessages>>[number];

export async function findClientRequestMessage(database: Database, messageId: string) {
  const [found] = await database.select().from(clientRequestMessage).where(eq(clientRequestMessage.id, messageId)).limit(1);
  return found ?? null;
}

export async function listClientRequestMessageAttachmentIds(database: Database, messageId: string) {
  const rows = await database
    .select({ mediaId: clientRequestMessageAttachment.mediaId })
    .from(clientRequestMessageAttachment)
    .where(eq(clientRequestMessageAttachment.messageId, messageId));
  return rows.map((row) => row.mediaId);
}

/** Chaves dos anexos da conversa e dos arquivos das rodadas (para apagar do CDN ao excluir a solicitação). */
export async function listClientRequestAttachmentKeys(database: Database, requestId: string) {
  const [messageFiles, deliveryFiles] = await Promise.all([
    database
      .select({ key: media.key })
      .from(clientRequestMessageAttachment)
      .innerJoin(clientRequestMessage, eq(clientRequestMessage.id, clientRequestMessageAttachment.messageId))
      .innerJoin(media, eq(media.id, clientRequestMessageAttachment.mediaId))
      .where(eq(clientRequestMessage.requestId, requestId)),
    database
      .select({ key: media.key })
      .from(clientRequestDeliveryFile)
      .innerJoin(clientRequestDelivery, eq(clientRequestDelivery.id, clientRequestDeliveryFile.deliveryId))
      .innerJoin(media, eq(media.id, clientRequestDeliveryFile.mediaId))
      .where(eq(clientRequestDelivery.requestId, requestId)),
  ]);
  return [...messageFiles, ...deliveryFiles].map((row) => row.key);
}

/** O arquivo já está numa mensagem ou numa rodada de solicitação (aí não sai como rascunho descartado). */
export async function isRequestAttachmentInUse(database: Database, mediaId: string) {
  const [inMessage, inDelivery] = await Promise.all([
    database
      .select({ messageId: clientRequestMessageAttachment.messageId })
      .from(clientRequestMessageAttachment)
      .where(eq(clientRequestMessageAttachment.mediaId, mediaId))
      .limit(1),
    database
      .select({ id: clientRequestDeliveryFile.id })
      .from(clientRequestDeliveryFile)
      .where(eq(clientRequestDeliveryFile.mediaId, mediaId))
      .limit(1),
  ]);
  return inMessage.length > 0 || inDelivery.length > 0;
}

// Leitura

/** O último "visto" antes desta visita (para a linha de "novas mensagens"). */
export async function getClientRequestLastRead(database: Database, requestId: string, viewer: RequestViewer) {
  if (viewer.kind === "team") {
    const [found] = await database
      .select({ lastReadAt: clientRequestRead.lastReadAt })
      .from(clientRequestRead)
      .where(and(eq(clientRequestRead.requestId, requestId), eq(clientRequestRead.userId, viewer.userId)))
      .limit(1);
    return found?.lastReadAt ?? viewer.since;
  }
  const [found] = await database
    .select({ lastReadAt: clientRequestPortalRead.lastReadAt })
    .from(clientRequestPortalRead)
    .where(and(eq(clientRequestPortalRead.requestId, requestId), eq(clientRequestPortalRead.portalUserId, viewer.portalUserId)))
    .limit(1);
  return found?.lastReadAt ?? viewer.since;
}

/** Marca como vista agora (abrir a página, mandar mensagem). */
export async function markClientRequestRead(database: Database, requestId: string, viewer: RequestViewer) {
  const now = new Date();
  if (viewer.kind === "team") {
    await database
      .insert(clientRequestRead)
      .values({ requestId, userId: viewer.userId, lastReadAt: now })
      .onConflictDoUpdate({ target: [clientRequestRead.requestId, clientRequestRead.userId], set: { lastReadAt: now } });
    return;
  }
  await database
    .insert(clientRequestPortalRead)
    .values({ requestId, portalUserId: viewer.portalUserId, lastReadAt: now })
    .onConflictDoUpdate({
      target: [clientRequestPortalRead.requestId, clientRequestPortalRead.portalUserId],
      set: { lastReadAt: now },
    });
}

// Equipe

/** Admins ativos: quem vê as solicitações e recebe os avisos delas. */
export async function listActiveAdminIds(database: Database) {
  const rows = await database
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), or(isNull(user.banned), eq(user.banned, false))));
  return rows.map((row) => row.id);
}
