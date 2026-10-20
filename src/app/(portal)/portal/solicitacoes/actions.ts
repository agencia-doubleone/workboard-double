"use server";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
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
import {
  canClientCancel,
  deliveryOutcome,
  INITIAL_REQUEST_STATUS,
  REQUEST_STATUSES,
  requestCode,
  STATUS_WHEN_DELIVERY_ANSWERED,
} from "@/lib/client-requests";
import { getPortalSession } from "@/lib/portal-session";
import {
  createClientRequestSchema,
  deliveryDecisionSchema,
  deliveryTargetSchema,
  requestMessageTargetSchema,
  requestTargetSchema,
  sendRequestMessageSchema,
  type CreateClientRequestInput,
  type DeliveryDecisionInput,
  type SendRequestMessageInput,
} from "@/lib/validations/client-requests";
import { toRequestTimeline } from "@/components/requests/present";
import { getRequestMeta, recordAudit } from "@/server/audit";
import {
  findClientRequestById,
  findClientRequestMessage,
  isRequestAttachmentInUse,
  listClientRequestEvents,
  listClientRequestMessageAttachmentIds,
  listClientRequestStatusHistory,
  markClientRequestRead,
  type ClientRequestFound,
} from "@/server/client-requests";
import { deleteMedia, deleteMediaByKey, findMediaById, isUploader } from "@/server/media";
import { notifyDeliveryAnswered, notifyRequestEvent, notifyRequestMessage } from "@/server/notify";
import { markPortalRequestNotificationsRead } from "@/server/portal-notifications";
import { findRequestDelivery, findRequestDeliveryFile, listDeliveryDecisions } from "@/server/request-deliveries";
import type { PortalContactRecord } from "@/server/portal";
import { sanitizeRichText } from "@/server/rich-text";

// Solicitações, do lado do cliente (portal). O cliente de tudo sai da sessão do
// contato (getPortalSession), nunca do que o navegador manda: uma solicitação de
// outro cliente "não existe", mesmo com o id certo. O contato abre, cancela
// (só enquanto "Aguardando análise") e conversa; a equipe (admins) é avisada no
// sino. Na auditoria, o contato é um ator externo.

export type PortalRequestResult =
  | { ok: true; message: string; number?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const NOT_FOUND = { ok: false, error: "Solicitação não encontrada." } as const;

async function getPortalContext() {
  const found = await getPortalSession();
  if (!found) return null;
  const { contact, client } = found;
  return {
    contact,
    client,
    actor: { id: contact.id, name: contact.name, email: contact.email, external: true },
    viewer: { kind: "portal" as const, portalUserId: contact.id, clientId: client.id, since: contact.createdAt },
    meta: getRequestMeta(await headers()),
  };
}

type PortalContext = NonNullable<Awaited<ReturnType<typeof getPortalContext>>>;

/** A solicitação, só se for do cliente do contato. */
function findOwnRequest(ctx: PortalContext, requestId: string) {
  return findClientRequestById(db, requestId, { clientId: ctx.client.id });
}

function requestEntity({ request }: { request: Pick<ClientRequestFound["request"], "id" | "number" | "title"> }) {
  return { type: "client_request" as const, id: request.id, label: `${requestCode(request.number)} ${request.title}` };
}

function requestRef(request: { id: string; number: number; title: string }, client: Pick<PortalContactRecord["client"], "name">) {
  return { id: request.id, number: request.number, title: request.title, clientName: client.name };
}

export async function createPortalRequest(input: CreateClientRequestInput): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = createClientRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const briefing = sanitizeRichText(parsed.data.briefing);
  if (!briefing) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: { briefing: ["Escreva o briefing: o que você precisa."] } };
  }

  const id = randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(clientRequest).values({
      id,
      clientId: ctx.client.id,
      title: parsed.data.title,
      briefing,
      status: INITIAL_REQUEST_STATUS,
      statusChangedAt: now,
      createdByPortalUserId: ctx.contact.id,
      createdByName: ctx.contact.name,
      createdAt: now,
    }),
    db.insert(clientRequestStatusHistory).values({
      requestId: id,
      status: INITIAL_REQUEST_STATUS,
      changedBySide: "client",
      changedByPortalUserId: ctx.contact.id,
      changedByName: ctx.contact.name,
      changedAt: now,
    }),
  ]);
  const created = await findOwnRequest(ctx, id);
  if (!created) return { ok: false, error: "Não foi possível abrir a solicitação." };

  await markClientRequestRead(db, id, ctx.viewer);
  await recordAudit({
    action: "client_request.created",
    actor: ctx.actor,
    entity: requestEntity(created),
    metadata: { clientId: ctx.client.id, clientName: ctx.client.name },
    ...ctx.meta,
  });
  notifyRequestEvent({
    type: "request.created",
    request: requestRef(created.request, ctx.client),
    actor: { id: null, name: ctx.contact.name },
  });

  return {
    ok: true,
    message: `Solicitação ${requestCode(created.request.number)} enviada para a Double One.`,
    number: created.request.number,
  };
}

/** O contato cancela a solicitação, só enquanto ninguém da agência começou a olhar. */
export async function cancelPortalRequest(input: { requestId: string }): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findOwnRequest(ctx, parsed.data.requestId);
  if (!found) return NOT_FOUND;
  if (!canClientCancel(found.request.status)) {
    return {
      ok: false,
      error: `A solicitação já está em "${REQUEST_STATUSES[found.request.status].label}": para cancelar, fale com a Double One pela conversa.`,
    };
  }

  const now = new Date();
  // Só se ainda estiver no status inicial: a equipe pode ter mudado no meio do caminho.
  const [canceled] = await db
    .update(clientRequest)
    .set({ status: "cancelada", statusChangedAt: now })
    .where(and(eq(clientRequest.id, found.request.id), eq(clientRequest.status, INITIAL_REQUEST_STATUS)))
    .returning({ id: clientRequest.id });
  if (!canceled) {
    refresh();
    return { ok: false, error: "A Double One acabou de mudar o status: para cancelar, fale com a equipe pela conversa." };
  }
  await db.insert(clientRequestStatusHistory).values({
    requestId: found.request.id,
    status: "cancelada",
    changedBySide: "client",
    changedByPortalUserId: ctx.contact.id,
    changedByName: ctx.contact.name,
    changedAt: now,
  });
  await recordAudit({
    action: "client_request.canceled",
    actor: ctx.actor,
    entity: requestEntity(found),
    metadata: { clientId: ctx.client.id },
    ...ctx.meta,
  });
  notifyRequestEvent({
    type: "request.canceled",
    request: requestRef(found.request, ctx.client),
    actor: { id: null, name: ctx.contact.name },
  });

  refresh();
  return { ok: true, message: `Solicitação ${requestCode(found.request.number)} cancelada.` };
}

// Conversa

export async function sendPortalRequestMessage(input: SendRequestMessageInput): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = sendRequestMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise a mensagem.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { requestId, body, attachmentIds } = parsed.data;
  if (!body && attachmentIds.length === 0) return { ok: false, error: "Escreva uma mensagem ou anexe um arquivo." };
  const found = await findOwnRequest(ctx, requestId);
  if (!found) return NOT_FOUND;

  // Anexos: arquivos que o próprio contato enviou para a pasta "solicitacoes".
  const files = await Promise.all(attachmentIds.map((mediaId) => findMediaById(db, mediaId)));
  if (files.some((file) => !file || !isUploader(file, ctx.actor) || file.folder !== "solicitacoes")) {
    return { ok: false, error: "Um dos anexos é inválido. Envie de novo." };
  }

  const messageId = randomUUID();
  await db.batch([
    db.insert(clientRequestMessage).values({
      id: messageId,
      requestId: found.request.id,
      authorSide: "client",
      authorPortalUserId: ctx.contact.id,
      authorName: ctx.contact.name,
      body,
    }),
    ...(attachmentIds.length
      ? [db.insert(clientRequestMessageAttachment).values(attachmentIds.map((mediaId) => ({ messageId, mediaId })))]
      : []),
  ]);
  await markClientRequestRead(db, found.request.id, ctx.viewer);
  notifyRequestMessage({
    request: requestRef(found.request, ctx.client),
    actor: { id: null, name: ctx.contact.name },
    body,
    attachmentCount: attachmentIds.length,
  });

  refresh();
  return { ok: true, message: "Mensagem enviada." };
}

/** O contato apaga só as próprias mensagens; os anexos saem do CDN. */
export async function deletePortalRequestMessage(input: { messageId: string }): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = requestMessageTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const message = await findClientRequestMessage(db, parsed.data.messageId);
  const found = message ? await findOwnRequest(ctx, message.requestId) : null;
  if (!message || !found) return { ok: false, error: "Mensagem não encontrada." };
  if (message.authorPortalUserId !== ctx.contact.id) return { ok: false, error: "Você só pode excluir as suas mensagens." };

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
export async function discardPortalRequestAttachment(input: { mediaId: string }): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = z.object({ mediaId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Anexo inválido." };
  const file = await findMediaById(db, parsed.data.mediaId);
  if (!file) return { ok: true, message: "Anexo removido." };
  if (!isUploader(file, ctx.actor) || file.folder !== "solicitacoes") return { ok: false, error: "Anexo inválido." };
  if (await isRequestAttachmentInUse(db, file.id)) return { ok: false, error: "Este anexo já está numa mensagem." };

  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta, audit: false });
  return result.ok ? { ok: true, message: "Anexo removido." } : { ok: false, error: result.error };
}

// Leituras sob demanda (modal do briefing e andamento na lista), só das do cliente do contato

export async function getPortalRequestBriefing(input: { requestId: string }) {
  const ctx = await getPortalContext();
  if (!ctx) return null;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const found = await findOwnRequest(ctx, parsed.data.requestId);
  return found ? { html: found.request.briefing } : null;
}

export async function getPortalRequestTimeline(input: { requestId: string }) {
  const ctx = await getPortalContext();
  if (!ctx) return null;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const found = await findOwnRequest(ctx, parsed.data.requestId);
  if (!found) return null;
  const [history, events] = await Promise.all([
    listClientRequestStatusHistory(db, found.request.id),
    listClientRequestEvents(db, found.request.id),
  ]);
  return toRequestTimeline(history, events);
}

/** Abrir a solicitação no portal: zera as não lidas do contato e as notificações dela no sino. */
export async function markPortalRequestRead(input: { requestId: string }) {
  const ctx = await getPortalContext();
  if (!ctx) return;
  const parsed = requestTargetSchema.safeParse(input);
  if (!parsed.success) return;
  const found = await findOwnRequest(ctx, parsed.data.requestId);
  if (!found) return;
  await Promise.all([
    markClientRequestRead(db, found.request.id, ctx.viewer),
    markPortalRequestNotificationsRead(db, ctx.contact.id, found.request.id),
  ]);
}

// Entregas para aprovação: só quem tem "Pode aprovar" no cadastro do acesso
// responde. As respostas de cada arquivo são rascunho (os contatos do cliente
// veem, a equipe não) até "Enviar respostas", que fecha a rodada.

const CANNOT_APPROVE = {
  ok: false,
  error: "Seu acesso acompanha as entregas, mas quem aprova é outro contato da sua empresa.",
} as const;
const DELIVERY_CLOSED = { ok: false, error: "Esta rodada já foi respondida ou substituída. Recarregue a página." } as const;

/** Aprovar, pedir alteração (dizendo o quê) ou desfazer a resposta de um arquivo. */
export async function decideDeliveryFile(input: DeliveryDecisionInput): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.contact.canApprove) return CANNOT_APPROVE;
  const parsed = deliveryDecisionSchema.safeParse(input);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { ok: false, error: errors.comment?.[0] ?? "Resposta inválida.", fieldErrors: errors };
  }
  const found = await findRequestDeliveryFile(db, parsed.data.fileId, { clientId: ctx.client.id });
  if (!found) return { ok: false, error: "Arquivo não encontrado." };
  if (found.delivery.status !== "pending") return DELIVERY_CLOSED;

  const { decision } = parsed.data;
  const [saved] = await db
    .update(clientRequestDeliveryFile)
    .set({
      decision,
      comment: decision === "changes" ? parsed.data.comment : null,
      decidedByPortalUserId: decision ? ctx.contact.id : null,
      decidedByName: decision ? ctx.contact.name : null,
      decidedAt: decision ? new Date() : null,
    })
    .where(
      and(
        eq(clientRequestDeliveryFile.id, found.file.id),
        // A rodada pode ter fechado (ou sido substituída) no meio do caminho.
        sql`exists (select 1 from ${clientRequestDelivery} where ${clientRequestDelivery.id} = ${clientRequestDeliveryFile.deliveryId} and ${clientRequestDelivery.status} = 'pending')`,
      ),
    )
    .returning({ id: clientRequestDeliveryFile.id });
  if (!saved) return DELIVERY_CLOSED;

  refresh();
  return { ok: true, message: decision ? "Resposta guardada." : "Resposta desfeita." };
}

/**
 * Envia as respostas: com todos os arquivos respondidos, a rodada fecha como
 * aprovada (tudo aprovado) ou com alterações pedidas, a solicitação volta para
 * "Em execução" e a equipe é avisada no sino.
 */
export async function submitDeliveryAnswer(input: { deliveryId: string }): Promise<PortalRequestResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.contact.canApprove) return CANNOT_APPROVE;
  const parsed = deliveryTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Entrega inválida." };
  const found = await findRequestDelivery(db, parsed.data.deliveryId, { clientId: ctx.client.id });
  if (!found) return { ok: false, error: "Entrega não encontrada." };
  if (found.delivery.status !== "pending") return DELIVERY_CLOSED;

  const decisions = (await listDeliveryDecisions(db, found.delivery.id)).map((row) => row.decision);
  if (decisions.length === 0 || decisions.some((decision) => !decision)) {
    return { ok: false, error: "Responda todos os arquivos antes de enviar." };
  }
  const outcome = deliveryOutcome(decisions);
  const approved = decisions.filter((decision) => decision === "approved").length;
  const changes = decisions.length - approved;
  const now = new Date();

  const [closed] = await db
    .update(clientRequestDelivery)
    .set({ status: outcome, answeredByPortalUserId: ctx.contact.id, answeredByName: ctx.contact.name, answeredAt: now })
    .where(and(eq(clientRequestDelivery.id, found.delivery.id), eq(clientRequestDelivery.status, "pending")))
    .returning({ id: clientRequestDelivery.id });
  if (!closed) return DELIVERY_CLOSED;

  const { request } = found;
  // Volta para "Em execução" (a equipe ajusta ou produz o final), a não ser que já esteja encerrada.
  const moveStatus = !REQUEST_STATUSES[request.status].closed && request.status !== STATUS_WHEN_DELIVERY_ANSWERED;
  await db.batch([
    db.insert(clientRequestEvent).values({
      requestId: request.id,
      type: "delivery_answered",
      data: { deliveryId: found.delivery.id, round: found.delivery.round, approved, changes },
      actorSide: "client",
      actorName: ctx.contact.name,
      createdAt: now,
    }),
    ...(moveStatus
      ? [
          db
            .update(clientRequest)
            .set({ status: STATUS_WHEN_DELIVERY_ANSWERED, statusChangedAt: now })
            .where(eq(clientRequest.id, request.id)),
          db.insert(clientRequestStatusHistory).values({
            requestId: request.id,
            status: STATUS_WHEN_DELIVERY_ANSWERED,
            changedBySide: "client",
            changedByPortalUserId: ctx.contact.id,
            changedByName: ctx.contact.name,
            changedAt: now,
          }),
        ]
      : []),
  ]);
  await recordAudit({
    action: "client_request.delivery_answered",
    actor: ctx.actor,
    entity: requestEntity({ request }),
    metadata: { clientId: ctx.client.id, round: found.delivery.round, approved, changes },
    ...ctx.meta,
  });
  notifyDeliveryAnswered({
    request: requestRef(request, ctx.client),
    actor: { id: null, name: ctx.contact.name },
    round: found.delivery.round,
    approved,
    changes,
  });

  refresh();
  return {
    ok: true,
    message:
      outcome === "approved"
        ? `Rodada ${found.delivery.round} aprovada. A Double One já foi avisada.`
        : "Respostas enviadas. A Double One vai cuidar das alterações.",
  };
}
