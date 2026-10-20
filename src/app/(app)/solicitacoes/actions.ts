"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import {
  clientRequest,
  clientRequestDelivery,
  clientRequestDeliveryFile,
  clientRequestEvent,
  clientRequestMessage,
  clientRequestMessageAttachment,
  clientRequestStatusHistory,
} from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import {
  REQUEST_STATUSES,
  requestCode,
  STATUS_WHEN_DELIVERY_SENT,
  type RequestEditedField,
} from "@/lib/client-requests";
import { formatCalendarDate } from "@/lib/format";
import { getAdminSession } from "@/lib/session";
import {
  deliveryTargetSchema,
  requestMessageTargetSchema,
  requestTargetSchema,
  sendDeliverySchema,
  sendRequestMessageSchema,
  setRequestExpectedOnSchema,
  setRequestStatusSchema,
  teamRequestSchema,
  updateRequestSchema,
  type SendDeliveryInput,
  type SendRequestMessageInput,
  type TeamRequestInput,
  type UpdateRequestInput,
} from "@/lib/validations/client-requests";
import { toRequestTimeline } from "@/components/requests/present";
import { getRequestMeta, recordAudit } from "@/server/audit";
import {
  findClientRequestById,
  findClientRequestMessage,
  hasClientParticipation,
  hasRequestNews,
  isRequestAttachmentInUse,
  listActiveAdminIds,
  listClientRequestAttachmentKeys,
  listClientRequestEvents,
  listClientRequestMessageAttachmentIds,
  listClientRequestStatusHistory,
  markClientRequestRead,
  type ClientRequestFound,
} from "@/server/client-requests";
import { findActiveClientById } from "@/server/clients";
import { deleteMedia, deleteMediaByKey, findMediaById } from "@/server/media";
import { markRequestNotificationsRead } from "@/server/notifications";
import {
  notifyPortalContacts,
  notifyPortalDelivery,
  notifyPortalMessage,
  notifyRequestEvent,
  notifyRequestMessage,
} from "@/server/notify";
import { publishRealtimeAfter } from "@/server/realtime";
import {
  findPendingDelivery,
  findRequestDelivery,
  listDeliveryFileKeys,
  listRemovableDeliveryFiles,
  nextDeliveryRound,
} from "@/server/request-deliveries";
import { richTextExcerpt, sanitizeRichText } from "@/server/rich-text";

// Solicitações, do lado da equipe: só admins (como a lista de Trabalhos).
// Cadastram em nome do cliente (pedido que chegou por telefone ou e-mail),
// editam, excluem, mudam o status e a previsão de entrega e conversam com o
// cliente. Tudo o que muda a solicitação vai para a auditoria; a conversa não
// (só a exclusão). O cliente vê tudo isso no portal (/portal/solicitacoes),
// inclusive o andamento: status, previsão e edições do assunto e do briefing.

export type RequestActionResult =
  | { ok: true; message: string; number?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const NOT_FOUND = { ok: false, error: "Solicitação não encontrada." } as const;

function invalid(fieldErrors: Record<string, string[] | undefined>): RequestActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors };
}

/** Revalida o admin a cada chamada: nunca confiar no navegador. */
async function getAdminContext() {
  const session = await getAdminSession();
  if (!session) return null;
  return { actor: session.user, meta: getRequestMeta(await headers()) };
}

type AdminContext = NonNullable<Awaited<ReturnType<typeof getAdminContext>>>;

function viewerOf(ctx: AdminContext) {
  return { kind: "team" as const, userId: ctx.actor.id, since: ctx.actor.createdAt };
}

function requestEntity({ request }: { request: Pick<ClientRequestFound["request"], "id" | "number" | "title"> }) {
  return { type: "client_request" as const, id: request.id, label: `${requestCode(request.number)} ${request.title}` };
}

function requestRef({ request, client }: ClientRequestFound) {
  return { id: request.id, number: request.number, title: request.title, clientName: client.name };
}

/** Para os avisos do portal: quem recebe são os contatos ativos deste cliente. */
function portalRef(request: { id: string; number: number; title: string }, client: { id: string; name: string }) {
  return { id: request.id, number: request.number, title: request.title, clientId: client.id, clientName: client.name };
}

function actorOf(ctx: AdminContext) {
  return { id: ctx.actor.id, name: ctx.actor.name };
}

const formatExpectedOn = (value: string | null) => (value ? formatCalendarDate(value) : null);

/** Registro do andamento feito por alguém da equipe (o cliente vê no portal). */
function teamEvent(ctx: AdminContext, requestId: string, at: Date) {
  return { requestId, actorSide: "team" as const, actorId: ctx.actor.id, actorName: ctx.actor.name, createdAt: at };
}

/** A previsão de entrega mudou: entra no andamento. */
function expectedOnEvent(ctx: AdminContext, requestId: string, at: Date, from: string | null, to: string | null) {
  return db.insert(clientRequestEvent).values({ ...teamEvent(ctx, requestId, at), type: "expected_on", data: { from, to } });
}

/**
 * A equipe cadastra a solicitação em nome do cliente (um pedido que chegou por
 * telefone, e-mail...), já com status e previsão se quiser. Aparece no portal
 * do cliente como aberta pela Double One; os outros admins são avisados no sino.
 */
export async function createRequest(input: TeamRequestInput): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = teamRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
  const { clientId, title, status, expectedOn } = parsed.data;
  const target = await findActiveClientById(db, clientId);
  if (!target) return invalid({ clientId: ["Cliente não encontrado ou arquivado."] });
  const briefing = sanitizeRichText(parsed.data.briefing) ?? "";

  const id = randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(clientRequest).values({
      id,
      clientId: target.id,
      title,
      briefing,
      status,
      statusChangedAt: now,
      expectedOn,
      createdBySide: "team",
      createdById: ctx.actor.id,
      createdByName: ctx.actor.name,
      createdAt: now,
    }),
    db.insert(clientRequestStatusHistory).values({
      requestId: id,
      status,
      changedBySide: "team",
      changedById: ctx.actor.id,
      changedByName: ctx.actor.name,
      changedAt: now,
    }),
    ...(expectedOn ? [expectedOnEvent(ctx, id, now, null, expectedOn)] : []),
  ]);
  const created = await findClientRequestById(db, id);
  if (!created) return { ok: false, error: "Não foi possível cadastrar a solicitação." };

  await markClientRequestRead(db, id, viewerOf(ctx));
  await recordAudit({
    action: "client_request.created",
    actor: ctx.actor,
    entity: requestEntity(created),
    metadata: { clientId: target.id, clientName: target.name, side: "team" },
    ...ctx.meta,
  });
  notifyRequestEvent({
    type: "request.created",
    request: requestRef(created),
    actor: { id: ctx.actor.id, name: ctx.actor.name },
  });
  notifyPortalContacts({ type: "request.created", request: portalRef(created.request, target), actor: actorOf(ctx) });

  refresh();
  const code = requestCode(created.request.number);
  return { ok: true, message: `Solicitação ${code} cadastrada para ${target.name}.`, number: created.request.number };
}

/**
 * Edita assunto, briefing, status, previsão e (só enquanto o cliente não
 * participou) o cliente. O que o cliente vê e mudou entra no andamento.
 */
export async function updateRequest(input: UpdateRequestInput): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = updateRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return NOT_FOUND;
  const { request } = found;
  const { title, status, expectedOn } = parsed.data;
  const briefing = sanitizeRichText(parsed.data.briefing) ?? "";

  let nextClient: { id: string; name: string } = found.client;
  if (parsed.data.clientId !== request.clientId) {
    // O que o cliente escreveu iria parar no portal de outra empresa.
    if (await hasClientParticipation(db, request)) {
      return invalid({ clientId: ["O cliente já participou desta solicitação: ela não muda mais de cliente."] });
    }
    const target = await findActiveClientById(db, parsed.data.clientId);
    if (!target) return invalid({ clientId: ["Cliente não encontrado ou arquivado."] });
    nextClient = target;
  }

  const changes: AuditChanges = {};
  const edited: RequestEditedField[] = [];
  if (title !== request.title) {
    changes.title = { from: request.title, to: title };
    edited.push("title");
  }
  if (briefing !== request.briefing) {
    changes.briefing = { from: richTextExcerpt(request.briefing), to: richTextExcerpt(briefing) };
    edited.push("briefing");
  }
  if (nextClient.id !== request.clientId) changes.client = { from: found.client.name, to: nextClient.name };
  const statusChanged = status !== request.status;
  if (statusChanged) changes.status = { from: REQUEST_STATUSES[request.status].label, to: REQUEST_STATUSES[status].label };
  const expectedOnChanged = expectedOn !== request.expectedOn;
  if (expectedOnChanged) {
    changes.expectedOn = { from: formatExpectedOn(request.expectedOn), to: formatExpectedOn(expectedOn) };
  }
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada mudou.", number: request.number };

  const now = new Date();
  await db.batch([
    db
      .update(clientRequest)
      .set({ title, briefing, clientId: nextClient.id, expectedOn, ...(statusChanged ? { status, statusChangedAt: now } : {}) })
      .where(eq(clientRequest.id, request.id)),
    ...(statusChanged
      ? [
          db.insert(clientRequestStatusHistory).values({
            requestId: request.id,
            status,
            changedBySide: "team",
            changedById: ctx.actor.id,
            changedByName: ctx.actor.name,
            changedAt: now,
          }),
        ]
      : []),
    ...(expectedOnChanged ? [expectedOnEvent(ctx, request.id, now, request.expectedOn, expectedOn)] : []),
    ...(edited.length
      ? [db.insert(clientRequestEvent).values({ ...teamEvent(ctx, request.id, now), type: "edited", data: { fields: edited } })]
      : []),
  ]);
  await recordAudit({
    action: "client_request.updated",
    actor: ctx.actor,
    entity: requestEntity({ request: { ...request, title } }),
    metadata: { changes },
    ...ctx.meta,
  });
  const ref = portalRef({ ...request, title }, nextClient);
  if (statusChanged) notifyPortalContacts({ type: "request.status", request: ref, actor: actorOf(ctx), data: { status } });
  if (expectedOnChanged) {
    notifyPortalContacts({ type: "request.expected_on", request: ref, actor: actorOf(ctx), data: { expectedOn } });
  }

  refresh();
  return { ok: true, message: `${requestCode(request.number)} atualizada.`, number: request.number };
}

/**
 * Exclui de vez, também do portal do cliente: andamento, conversa, anexos (do
 * CDN) e as notificações dela. O número não é reaproveitado. As imagens do
 * briefing ficam no CDN e aparecem como sem uso em Arquivos.
 */
export async function deleteClientRequest(input: { requestId: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return NOT_FOUND;

  const [attachmentKeys, adminIds] = await Promise.all([
    listClientRequestAttachmentKeys(db, found.request.id),
    listActiveAdminIds(db),
  ]);
  await db.delete(clientRequest).where(eq(clientRequest.id, found.request.id));
  // As notificações dela saíram junto: o sino e o número do menu de cada admin recontam.
  publishRealtimeAfter(adminIds, { type: "notifications.read" });
  for (const key of attachmentKeys) {
    await deleteMediaByKey(db, key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "client_request.deleted",
    actor: ctx.actor,
    entity: requestEntity(found),
    metadata: { clientId: found.client.id, clientName: found.client.name, attachments: attachmentKeys.length },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Solicitação ${requestCode(found.request.number)} excluída.` };
}

export async function setRequestStatus(input: { requestId: string; status: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = setRequestStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return NOT_FOUND;
  const { status } = parsed.data;
  const label = REQUEST_STATUSES[status].label;
  if (found.request.status === status) return { ok: true, message: `A solicitação já estava em "${label}".` };

  const now = new Date();
  await db.batch([
    db.update(clientRequest).set({ status, statusChangedAt: now }).where(eq(clientRequest.id, found.request.id)),
    db.insert(clientRequestStatusHistory).values({
      requestId: found.request.id,
      status,
      changedBySide: "team",
      changedById: ctx.actor.id,
      changedByName: ctx.actor.name,
      changedAt: now,
    }),
  ]);
  await recordAudit({
    action: "client_request.status_changed",
    actor: ctx.actor,
    entity: requestEntity(found),
    metadata: { changes: { status: { from: REQUEST_STATUSES[found.request.status].label, to: label } } },
    ...ctx.meta,
  });
  notifyPortalContacts({
    type: "request.status",
    request: portalRef(found.request, found.client),
    actor: actorOf(ctx),
    data: { status },
  });

  refresh();
  return { ok: true, message: `${requestCode(found.request.number)} agora está em "${label}".` };
}

/** Previsão de entrega pela página da solicitação (salva sozinha); entra no andamento. */
export async function setRequestExpectedOn(input: { requestId: string; expectedOn: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = setRequestExpectedOnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.flattenError(parsed.error).fieldErrors.expectedOn?.[0] ?? "Data inválida." };
  }
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return NOT_FOUND;
  const { expectedOn } = parsed.data;
  if (found.request.expectedOn === expectedOn) return { ok: true, message: "Nada para salvar." };

  await db.batch([
    db.update(clientRequest).set({ expectedOn }).where(eq(clientRequest.id, found.request.id)),
    expectedOnEvent(ctx, found.request.id, new Date(), found.request.expectedOn, expectedOn),
  ]);
  await recordAudit({
    action: "client_request.updated",
    actor: ctx.actor,
    entity: requestEntity(found),
    metadata: {
      changes: { expectedOn: { from: formatExpectedOn(found.request.expectedOn), to: formatExpectedOn(expectedOn) } },
    },
    ...ctx.meta,
  });
  notifyPortalContacts({
    type: "request.expected_on",
    request: portalRef(found.request, found.client),
    actor: actorOf(ctx),
    data: { expectedOn },
  });

  refresh();
  return {
    ok: true,
    message: expectedOn ? `Previsão de entrega: ${formatCalendarDate(expectedOn)}.` : "Previsão de entrega removida.",
  };
}

// Entregas para aprovação

/**
 * Manda uma rodada para o cliente aprovar: os arquivos (que a própria pessoa
 * acabou de enviar para a pasta "solicitacoes") e o recado. A rodada que ainda
 * esperava resposta fica "Substituída", e a solicitação passa para "Aguardando
 * aprovação". Os contatos são avisados no sino do portal e, quem pode aprovar,
 * por e-mail.
 */
export async function sendDelivery(input: SendDeliveryInput): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = sendDeliverySchema.safeParse(input);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { ok: false, error: errors.mediaIds?.[0] ?? errors.note?.[0] ?? "Revise a entrega.", fieldErrors: errors };
  }
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return NOT_FOUND;
  const { request } = found;
  if (REQUEST_STATUSES[request.status].closed) {
    return {
      ok: false,
      error: `A solicitação está "${REQUEST_STATUSES[request.status].label}": mude o status antes de mandar uma entrega.`,
    };
  }
  const { mediaIds } = parsed.data;
  const files = await Promise.all(mediaIds.map((mediaId) => findMediaById(db, mediaId)));
  const inUse = await Promise.all(mediaIds.map((mediaId) => isRequestAttachmentInUse(db, mediaId)));
  if (files.some((file) => !file || file.uploadedById !== ctx.actor.id || file.folder !== "solicitacoes") || inUse.some(Boolean)) {
    return { ok: false, error: "Um dos arquivos é inválido. Envie de novo." };
  }
  const note = sanitizeRichText(parsed.data.note) ?? "";

  const [round, pending] = await Promise.all([nextDeliveryRound(db, request.id), findPendingDelivery(db, request.id)]);
  const deliveryId = randomUUID();
  const now = new Date();
  const moveStatus = request.status !== STATUS_WHEN_DELIVERY_SENT;
  try {
    await db.batch([
      db.insert(clientRequestDelivery).values({
        id: deliveryId,
        requestId: request.id,
        round,
        note,
        status: "pending",
        sentById: ctx.actor.id,
        sentByName: ctx.actor.name,
        sentAt: now,
      }),
      db
        .insert(clientRequestDeliveryFile)
        .values(mediaIds.map((mediaId, position) => ({ deliveryId, mediaId, name: files[position]?.name ?? null, position }))),
      db.insert(clientRequestEvent).values({
        ...teamEvent(ctx, request.id, now),
        type: "delivery_sent",
        data: { deliveryId, round, files: mediaIds.length },
      }),
      ...(pending
        ? [
            db
              .update(clientRequestDelivery)
              .set({ status: "superseded" })
              .where(and(eq(clientRequestDelivery.id, pending.id), eq(clientRequestDelivery.status, "pending"))),
          ]
        : []),
      ...(moveStatus
        ? [
            db
              .update(clientRequest)
              .set({ status: STATUS_WHEN_DELIVERY_SENT, statusChangedAt: now })
              .where(eq(clientRequest.id, request.id)),
            db.insert(clientRequestStatusHistory).values({
              requestId: request.id,
              status: STATUS_WHEN_DELIVERY_SENT,
              changedBySide: "team",
              changedById: ctx.actor.id,
              changedByName: ctx.actor.name,
              changedAt: now,
            }),
          ]
        : []),
    ]);
  } catch (error) {
    // Duas rodadas ao mesmo tempo disputam o mesmo número.
    console.error("[solicitações] falha ao mandar a entrega", error);
    return { ok: false, error: "Não foi possível mandar a entrega. Recarregue a página e tente de novo." };
  }
  await recordAudit({
    action: "client_request.delivery_sent",
    actor: ctx.actor,
    entity: requestEntity(found),
    metadata: { round, files: mediaIds.length, supersededRound: pending?.round ?? null },
    ...ctx.meta,
  });
  notifyPortalDelivery({ request: portalRef(request, found.client), actor: actorOf(ctx), round, files: mediaIds.length });

  refresh();
  return { ok: true, message: `Rodada ${round} enviada para o cliente aprovar.` };
}

/**
 * Retira uma rodada que o cliente ainda não respondeu (arquivo errado, faltou
 * algo): some do portal com o registro dela no andamento, e os arquivos saem
 * do CDN. O status da solicitação fica como está.
 */
export async function withdrawDelivery(input: { deliveryId: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = deliveryTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Entrega inválida." };
  const found = await findRequestDelivery(db, parsed.data.deliveryId);
  if (!found) return { ok: false, error: "Entrega não encontrada." };
  if (found.delivery.status !== "pending") return { ok: false, error: "Só dá para retirar uma rodada que ainda espera resposta." };

  const keys = await listDeliveryFileKeys(db, found.delivery.id);
  const [removed] = await db
    .delete(clientRequestDelivery)
    .where(and(eq(clientRequestDelivery.id, found.delivery.id), eq(clientRequestDelivery.status, "pending")))
    .returning({ id: clientRequestDelivery.id });
  if (!removed) {
    refresh();
    return { ok: false, error: "O cliente acabou de responder esta rodada." };
  }
  await db
    .delete(clientRequestEvent)
    .where(
      and(
        eq(clientRequestEvent.requestId, found.request.id),
        eq(clientRequestEvent.type, "delivery_sent"),
        sql`${clientRequestEvent.data}->>'deliveryId' = ${found.delivery.id}`,
      ),
    );
  for (const key of keys) {
    await deleteMediaByKey(db, key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "client_request.delivery_withdrawn",
    actor: ctx.actor,
    entity: requestEntity({ request: found.request }),
    metadata: { round: found.delivery.round, files: keys.length },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Rodada ${found.delivery.round} retirada.` };
}

/**
 * Depois de uma rodada aprovada, tira do servidor (CDN) os arquivos das
 * rodadas anteriores que não foram aprovadas (substituídas ou com alterações
 * pedidas): as versões velhas não ficam ocupando espaço. As rodadas e as
 * respostas do cliente ficam como histórico, dos dois lados, com o nome de
 * cada arquivo e o aviso de que ele saiu do servidor.
 */
export async function removeOldDeliveryFiles(input: { deliveryId: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = deliveryTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Entrega inválida." };
  const found = await findRequestDelivery(db, parsed.data.deliveryId);
  if (!found) return { ok: false, error: "Entrega não encontrada." };
  if (found.delivery.status !== "approved") {
    return { ok: false, error: "Só depois de uma rodada aprovada dá para excluir os arquivos das anteriores." };
  }

  const { deliveries, keys } = await listRemovableDeliveryFiles(db, found.request.id, found.delivery.round);
  if (keys.length === 0) return { ok: true, message: "As rodadas anteriores já não têm arquivos no servidor." };
  // Apagar o arquivo deixa o vínculo da rodada sem ele (media_id vira null): a rodada continua.
  for (const key of keys) {
    await deleteMediaByKey(db, key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await db
    .update(clientRequestDelivery)
    .set({ filesRemovedAt: new Date(), filesRemovedByName: ctx.actor.name })
    .where(
      inArray(
        clientRequestDelivery.id,
        deliveries.map((delivery) => delivery.id),
      ),
    );
  const rounds = deliveries.map((delivery) => delivery.round);
  await recordAudit({
    action: "client_request.delivery_files_removed",
    actor: ctx.actor,
    entity: requestEntity({ request: found.request }),
    metadata: { approvedRound: found.delivery.round, rounds, files: keys.length },
    ...ctx.meta,
  });

  refresh();
  const files = keys.length === 1 ? "1 arquivo excluído" : `${keys.length} arquivos excluídos`;
  return {
    ok: true,
    message: rounds.length === 1 ? `${files} da rodada ${rounds[0]}.` : `${files} de ${rounds.length} rodadas.`,
  };
}

// Conversa

export async function sendRequestMessage(input: SendRequestMessageInput): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = sendRequestMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise a mensagem.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { requestId, body, attachmentIds } = parsed.data;
  if (!body && attachmentIds.length === 0) return { ok: false, error: "Escreva uma mensagem ou anexe um arquivo." };
  const found = await findClientRequestById(db, requestId);
  if (!found) return NOT_FOUND;

  // Anexos: arquivos que a própria pessoa enviou para a pasta "solicitacoes".
  const files = await Promise.all(attachmentIds.map((mediaId) => findMediaById(db, mediaId)));
  if (files.some((file) => !file || file.uploadedById !== ctx.actor.id || file.folder !== "solicitacoes")) {
    return { ok: false, error: "Um dos anexos é inválido. Envie de novo." };
  }

  const messageId = randomUUID();
  await db.batch([
    db.insert(clientRequestMessage).values({
      id: messageId,
      requestId: found.request.id,
      authorSide: "team",
      authorId: ctx.actor.id,
      authorName: ctx.actor.name,
      body,
    }),
    ...(attachmentIds.length
      ? [db.insert(clientRequestMessageAttachment).values(attachmentIds.map((mediaId) => ({ messageId, mediaId })))]
      : []),
  ]);
  await markClientRequestRead(db, found.request.id, viewerOf(ctx));
  notifyRequestMessage({
    request: requestRef(found),
    actor: { id: ctx.actor.id, name: ctx.actor.name },
    body,
    attachmentCount: attachmentIds.length,
  });
  notifyPortalMessage({
    request: portalRef(found.request, found.client),
    actor: actorOf(ctx),
    body,
    attachmentCount: attachmentIds.length,
  });

  refresh();
  return { ok: true, message: "Mensagem enviada." };
}

/** Admins apagam qualquer mensagem da conversa (inclusive a do cliente); os anexos saem do CDN. */
export async function deleteRequestMessage(input: { messageId: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = requestMessageTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const message = await findClientRequestMessage(db, parsed.data.messageId);
  const found = message ? await findClientRequestById(db, message.requestId) : null;
  if (!message || !found) return { ok: false, error: "Mensagem não encontrada." };

  const attachmentIds = await listClientRequestMessageAttachmentIds(db, message.id);
  await db.delete(clientRequestMessage).where(eq(clientRequestMessage.id, message.id));
  for (const mediaId of attachmentIds) {
    const file = await findMediaById(db, mediaId);
    if (file) await deleteMediaByKey(db, file.key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "client_request.message_deleted",
    actor: ctx.actor,
    entity: requestEntity(found),
    metadata: { author: message.authorName, side: message.authorSide, attachments: attachmentIds.length },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Mensagem excluída." };
}

/** Anexo enviado e tirado do rascunho antes de mandar a mensagem: sai do CDN. */
export async function discardRequestAttachment(input: { mediaId: string }): Promise<RequestActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = z.object({ mediaId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Anexo inválido." };
  const file = await findMediaById(db, parsed.data.mediaId);
  if (!file) return { ok: true, message: "Anexo removido." };
  if (file.uploadedById !== ctx.actor.id || file.folder !== "solicitacoes") return FORBIDDEN;
  if (await isRequestAttachmentInUse(db, file.id)) return { ok: false, error: "Este anexo já está numa mensagem." };

  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta, audit: false });
  return result.ok ? { ok: true, message: "Anexo removido." } : { ok: false, error: result.error };
}

// Leituras sob demanda (modal do briefing e andamento na lista)

export async function getRequestBriefing(input: { requestId: string }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const found = await findClientRequestById(db, parsed.data.requestId);
  return found ? { html: found.request.briefing } : null;
}

export async function getRequestTimeline(input: { requestId: string }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return null;
  const [history, events] = await Promise.all([
    listClientRequestStatusHistory(db, found.request.id),
    listClientRequestEvents(db, found.request.id),
  ]);
  return toRequestTimeline(history, events);
}

/** Abrir a solicitação: zera as novidades e as notificações dela de quem está vendo. */
export async function markRequestRead(input: { requestId: string }) {
  const ctx = await getAdminContext();
  if (!ctx) return;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return;
  const found = await findClientRequestById(db, parsed.data.requestId);
  if (!found) return;
  const viewer = viewerOf(ctx);
  const hadNews = await hasRequestNews(db, found.request.id, viewer);
  const [, cleared] = await Promise.all([
    markClientRequestRead(db, found.request.id, viewer),
    markRequestNotificationsRead(db, ctx.actor.id, found.request.id),
  ]);
  // O sino e o número do menu (nesta aba e nas outras) recontam.
  if (hadNews || cleared > 0) publishRealtimeAfter([ctx.actor.id], { type: "notifications.read" });
}
