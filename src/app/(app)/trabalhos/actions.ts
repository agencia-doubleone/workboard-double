"use server";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { job, jobAssignee, jobMessage, jobMessageAttachment, jobStatusHistory, user } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { extractMentions } from "@/lib/jobs";
import { getSession } from "@/lib/session";
import {
  createJobSchema,
  jobTargetSchema,
  messageTargetSchema,
  sendMessageSchema,
  setJobActiveSchema,
  setJobStatusSchema,
  updateJobSchema,
  type CreateJobInput,
  type SendMessageInput,
  type UpdateJobInput,
} from "@/lib/validations/jobs";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { findClientById } from "@/server/clients";
import {
  filterActiveUserIds,
  findJobById,
  findJobStatusById,
  isAttachmentInUse,
  listAssignees,
  listJobAttachmentKeys,
  listJobStatusHistory,
  markJobRead as markRead,
  type JobStatusRecord,
} from "@/server/jobs";
import { deleteMedia, deleteMediaByKey, findMediaById } from "@/server/media";
import { richTextExcerpt, sanitizeRichText } from "@/server/rich-text";

// Toda a equipe cadastra, edita, muda status e conversa; só admins excluem
// trabalhos. Toda mudança vai para a auditoria (mensagens não: são conversa).

export type JobActionResult =
  | { ok: true; message: string; pit?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const JOB_NOT_FOUND = { ok: false, error: "Trabalho não encontrado." } as const;

/** Revalida a sessão a cada chamada: nunca confiar no cliente. */
async function getTeamContext() {
  const session = await getSession();
  if (!session) return null;
  const requestHeaders = await headers();
  return {
    actor: session.user,
    isAdmin: session.user.role === "admin",
    meta: getRequestMeta(requestHeaders),
  };
}

function invalid(error: z.ZodError): JobActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function jobEntity(row: { id: string; pit: number; name: string }) {
  return { type: "job" as const, id: row.id, label: `#${row.pit} ${row.name}` };
}

function historyEntry(jobId: string, status: JobStatusRecord, actor: { id: string; name: string }) {
  return {
    jobId,
    statusId: status.id,
    statusName: status.name,
    textColor: status.textColor,
    backgroundColor: status.backgroundColor,
    changedById: actor.id,
    changedByName: actor.name,
  };
}

/** Cliente válido para um trabalho: existe e não está arquivado (a não ser que já fosse o dele). */
async function resolveClient(clientId: string, currentClientId?: string) {
  const found = await findClientById(db, clientId);
  if (!found || (found.archivedAt && found.id !== currentClientId)) return null;
  return found;
}

export async function createJob(input: CreateJobInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;

  const [targetClient, status, assigneeIds] = await Promise.all([
    resolveClient(data.clientId),
    findJobStatusById(db, data.statusId),
    filterActiveUserIds(db, data.assigneeIds),
  ]);
  if (!targetClient) return { ok: false, error: "Cliente inválido.", fieldErrors: { clientId: ["Escolha um cliente ativo."] } };
  if (!status) return { ok: false, error: "Status inválido.", fieldErrors: { statusId: ["Escolha o status."] } };

  // O id sai daqui para o trabalho, os funcionários e o histórico irem num lote só (atômico).
  const id = randomUUID();
  try {
    const [[created]] = await db.batch([
      db
        .insert(job)
        .values({
          id,
          name: data.name,
          clientId: targetClient.id,
          statusId: status.id,
          dueDate: data.dueDate,
          active: data.active,
          briefing: sanitizeRichText(data.briefing),
          createdById: ctx.actor.id,
        })
        .returning({ id: job.id, pit: job.pit, name: job.name }),
      db.insert(jobStatusHistory).values(historyEntry(id, status, ctx.actor)),
      ...(assigneeIds.length ? [db.insert(jobAssignee).values(assigneeIds.map((userId) => ({ jobId: id, userId })))] : []),
    ]);
    await recordAudit({
      action: "job.created",
      actor: ctx.actor,
      entity: jobEntity(created),
      metadata: { client: targetClient.name, status: status.name, assignees: assigneeIds.length },
      ...ctx.meta,
    });
    return { ok: true, message: `Trabalho #${created.pit} cadastrado.`, pit: created.pit };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível cadastrar o trabalho." };
  }
}

export async function updateJob(input: UpdateJobInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = updateJobSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  const current = await findJobById(db, data.jobId);
  if (!current) return JOB_NOT_FOUND;

  const [targetClient, status, assigneeIds, currentAssignees, currentStatus, currentClient] = await Promise.all([
    resolveClient(data.clientId, current.clientId),
    findJobStatusById(db, data.statusId),
    filterActiveUserIds(db, data.assigneeIds),
    listAssignees(db, [current.id]).then((map) => map.get(current.id) ?? []),
    findJobStatusById(db, current.statusId),
    findClientById(db, current.clientId),
  ]);
  if (!targetClient) return { ok: false, error: "Cliente inválido.", fieldErrors: { clientId: ["Escolha um cliente ativo."] } };
  if (!status) return { ok: false, error: "Status inválido.", fieldErrors: { statusId: ["Escolha o status."] } };

  const briefing = sanitizeRichText(data.briefing);
  const changes: AuditChanges = {};
  if (data.name !== current.name) changes.name = { from: current.name, to: data.name };
  if (targetClient.id !== current.clientId) changes.client = { from: currentClient?.name ?? null, to: targetClient.name };
  if (data.dueDate !== current.dueDate) changes.dueDate = { from: current.dueDate, to: data.dueDate };
  if (data.active !== current.active) changes.active = { from: current.active, to: data.active };
  if ((briefing ?? null) !== (current.briefing ?? null)) {
    changes.briefing = { from: richTextExcerpt(current.briefing), to: richTextExcerpt(briefing) };
  }
  const before = currentAssignees.map((person) => person.id).sort();
  const after = [...assigneeIds].sort();
  const assigneesChanged = before.join() !== after.join();
  if (assigneesChanged) {
    const added = after.length
      ? await db.select({ name: user.name }).from(user).where(inArray(user.id, after))
      : [];
    changes.assignees = { from: currentAssignees.map((person) => person.name), to: added.map((person) => person.name) };
  }
  const statusChanged = status.id !== current.statusId;
  if (statusChanged) changes.status = { from: currentStatus?.name ?? null, to: status.name };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar.", pit: current.pit };

  try {
    await db.batch([
      db
        .update(job)
        .set({
          name: data.name,
          clientId: targetClient.id,
          statusId: status.id,
          dueDate: data.dueDate,
          active: data.active,
          briefing,
          ...(statusChanged ? { statusChangedAt: new Date() } : {}),
        })
        .where(eq(job.id, current.id)),
      ...(statusChanged ? [db.insert(jobStatusHistory).values(historyEntry(current.id, status, ctx.actor))] : []),
      ...(assigneesChanged ? [db.delete(jobAssignee).where(eq(jobAssignee.jobId, current.id))] : []),
      ...(assigneesChanged && assigneeIds.length
        ? [db.insert(jobAssignee).values(assigneeIds.map((userId) => ({ jobId: current.id, userId })))]
        : []),
    ]);
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível salvar o trabalho." };
  }
  await recordAudit({
    action: "job.updated",
    actor: ctx.actor,
    entity: jobEntity({ ...current, name: data.name }),
    metadata: { changes },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Trabalho #${current.pit} atualizado.`, pit: current.pit };
}

/** Troca só o status (pela lista ou pela página do trabalho). */
export async function setJobStatus(input: { jobId: string; statusId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = setJobStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const [current, status] = await Promise.all([
    findJobById(db, parsed.data.jobId),
    findJobStatusById(db, parsed.data.statusId),
  ]);
  if (!current) return JOB_NOT_FOUND;
  if (!status) return { ok: false, error: "Status inválido." };
  if (status.id === current.statusId) return { ok: true, message: "O trabalho já está nesse status." };
  const previous = await findJobStatusById(db, current.statusId);

  await db.batch([
    db.update(job).set({ statusId: status.id, statusChangedAt: new Date() }).where(eq(job.id, current.id)),
    db.insert(jobStatusHistory).values(historyEntry(current.id, status, ctx.actor)),
  ]);
  await recordAudit({
    action: "job.status_changed",
    actor: ctx.actor,
    entity: jobEntity(current),
    metadata: { changes: { status: { from: previous?.name ?? null, to: status.name } } },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `#${current.pit}: ${status.name}.` };
}

export async function setJobActive(input: { jobId: string; active: boolean }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = setJobActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Trabalho inválido." };
  const current = await findJobById(db, parsed.data.jobId);
  if (!current) return JOB_NOT_FOUND;
  const { active } = parsed.data;
  if (current.active === active) return { ok: true, message: active ? "O trabalho já estava ativo." : "O trabalho já estava inativo." };

  await db.update(job).set({ active }).where(eq(job.id, current.id));
  await recordAudit({
    action: active ? "job.activated" : "job.deactivated",
    actor: ctx.actor,
    entity: jobEntity(current),
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: active ? `#${current.pit} ativado.` : `#${current.pit} desativado.` };
}

/** Exclui de vez (só admins): mensagens, anexos (também no CDN) e histórico vão junto. */
export async function deleteJob(input: { jobId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.isAdmin) return FORBIDDEN;

  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Trabalho inválido." };
  const current = await findJobById(db, parsed.data.jobId);
  if (!current) return JOB_NOT_FOUND;

  const attachmentKeys = await listJobAttachmentKeys(db, current.id);
  await db.delete(job).where(eq(job.id, current.id));
  for (const key of attachmentKeys) {
    await deleteMediaByKey(db, key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "job.deleted",
    actor: ctx.actor,
    entity: jobEntity(current),
    metadata: { pit: current.pit, attachments: attachmentKeys.length },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Trabalho #${current.pit} excluído.` };
}

// Mensagens

export async function sendMessage(input: SendMessageInput): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { jobId, body, attachmentIds } = parsed.data;
  const current = await findJobById(db, jobId);
  if (!current) return JOB_NOT_FOUND;

  // Anexos: arquivos que a própria pessoa enviou para a pasta "trabalhos".
  const files = await Promise.all(attachmentIds.map((mediaId) => findMediaById(db, mediaId)));
  if (files.some((file) => !file || file.uploadedById !== ctx.actor.id || file.folder !== "trabalhos")) {
    return { ok: false, error: "Um dos anexos é inválido. Envie de novo." };
  }
  // Menções só de pessoas ativas; as outras viram texto comum.
  const mentions = await filterActiveUserIds(db, extractMentions(body));

  const messageId = randomUUID();
  await db.batch([
    db.insert(jobMessage).values({
      id: messageId,
      jobId: current.id,
      authorId: ctx.actor.id,
      authorName: ctx.actor.name,
      body,
      mentions,
    }),
    ...(attachmentIds.length
      ? [db.insert(jobMessageAttachment).values(attachmentIds.map((mediaId) => ({ messageId, mediaId })))]
      : []),
  ]);
  await markRead(db, current.id, ctx.actor.id);

  refresh();
  return { ok: true, message: "Mensagem enviada." };
}

/** Quem escreveu (ou um admin) apaga a mensagem; os anexos saem do CDN. */
export async function deleteMessage(input: { messageId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = messageTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const [found] = await db.select().from(jobMessage).where(eq(jobMessage.id, parsed.data.messageId)).limit(1);
  if (!found) return { ok: false, error: "Mensagem não encontrada." };
  if (found.authorId !== ctx.actor.id && !ctx.isAdmin) return FORBIDDEN;
  const current = await findJobById(db, found.jobId);

  const attachments = await db
    .select({ mediaId: jobMessageAttachment.mediaId })
    .from(jobMessageAttachment)
    .where(eq(jobMessageAttachment.messageId, found.id));
  await db.delete(jobMessage).where(eq(jobMessage.id, found.id));
  for (const { mediaId } of attachments) {
    const file = await findMediaById(db, mediaId);
    if (file) await deleteMediaByKey(db, file.key, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  if (current) {
    await recordAudit({
      action: "job.message_deleted",
      actor: ctx.actor,
      entity: jobEntity(current),
      metadata: { author: found.authorName, attachments: attachments.length },
      ...ctx.meta,
    });
  }

  refresh();
  return { ok: true, message: "Mensagem excluída." };
}

/** Anexo enviado e tirado do rascunho antes de mandar a mensagem: sai do CDN. */
export async function discardAttachment(input: { mediaId: string }): Promise<JobActionResult> {
  const ctx = await getTeamContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = z.object({ mediaId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Anexo inválido." };
  const file = await findMediaById(db, parsed.data.mediaId);
  if (!file) return { ok: true, message: "Anexo removido." };
  if (file.uploadedById !== ctx.actor.id || file.folder !== "trabalhos") return FORBIDDEN;
  if (await isAttachmentInUse(db, file.id)) return { ok: false, error: "Este anexo já está numa mensagem." };

  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta, audit: false });
  return result.ok ? { ok: true, message: "Anexo removido." } : { ok: false, error: result.error };
}

/** Zera as não lidas de quem está vendo o trabalho. */
export async function markJobRead(input: { jobId: string }) {
  const ctx = await getTeamContext();
  if (!ctx) return;
  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return;
  await markRead(db, parsed.data.jobId, ctx.actor.id);
}

// Leituras sob demanda (modal do briefing e histórico na lista)

export async function getJobBriefing(input: { jobId: string }) {
  const ctx = await getTeamContext();
  if (!ctx) return null;
  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const [found] = await db
    .select({ briefing: job.briefing })
    .from(job)
    .where(eq(job.id, parsed.data.jobId))
    .limit(1);
  return found ? { html: found.briefing } : null;
}

export async function getJobStatusHistory(input: { jobId: string }) {
  const ctx = await getTeamContext();
  if (!ctx) return null;
  const parsed = jobTargetSchema.safeParse(input);
  if (!parsed.success) return null;
  const rows = await listJobStatusHistory(db, parsed.data.jobId);
  return rows.map((row) => ({
    id: row.id,
    statusName: row.statusName,
    textColor: row.textColor,
    backgroundColor: row.backgroundColor,
    changedByName: row.changedByName,
    changedAt: row.changedAt.toISOString(),
  }));
}
