"use server";

import { asc, eq, max, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { jobStatus } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { getAdminSession } from "@/lib/session";
import {
  createJobStatusSchema,
  jobStatusTargetSchema,
  moveJobStatusSchema,
  updateJobStatusSchema,
  type CreateJobStatusInput,
  type UpdateJobStatusInput,
} from "@/lib/validations/jobs";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { countJobsWithStatus, findJobStatusById } from "@/server/jobs";

// Status de trabalho: só admins mexem. O padrão e os status em uso não podem
// ser apagados (o banco também impede: FK restrict em job.status_id).

export type StatusActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const NOT_FOUND = { ok: false, error: "Status não encontrado." } as const;
const DUPLICATE: StatusActionResult = {
  ok: false,
  error: "Já existe um status com esse nome.",
  fieldErrors: { name: ["Já existe um status com esse nome."] },
};

async function getAdminContext() {
  const adminSession = await getAdminSession();
  if (!adminSession) return null;
  return { actor: adminSession.user, meta: getRequestMeta(await headers()) };
}

function invalid(error: z.ZodError): StatusActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function statusEntity(row: { id: string; name: string }) {
  return { type: "job_status" as const, id: row.id, label: row.name };
}

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export async function createJobStatus(input: CreateJobStatusInput): Promise<StatusActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = createJobStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const [{ last }] = await db.select({ last: max(jobStatus.position) }).from(jobStatus);
    const [created] = await db
      .insert(jobStatus)
      .values({ ...parsed.data, position: (last ?? -1) + 1 })
      .returning();
    await recordAudit({
      action: "job_status.created",
      actor: ctx.actor,
      entity: statusEntity(created),
      metadata: { textColor: created.textColor, backgroundColor: created.backgroundColor, isFinal: created.isFinal },
      ...ctx.meta,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    console.error(error);
    return { ok: false, error: "Não foi possível criar o status." };
  }

  refresh();
  return { ok: true, message: `Status “${parsed.data.name}” criado.` };
}

export async function updateJobStatus(input: UpdateJobStatusInput): Promise<StatusActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = updateJobStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const current = await findJobStatusById(db, parsed.data.statusId);
  if (!current) return NOT_FOUND;

  const { name, textColor, backgroundColor, isFinal } = parsed.data;
  if (isFinal && current.isDefault) {
    return { ok: false, error: "O status padrão não pode encerrar o trabalho: todo trabalho novo nasceria encerrado." };
  }
  const changes: AuditChanges = {};
  if (name !== current.name) changes.name = { from: current.name, to: name };
  if (textColor !== current.textColor) changes.textColor = { from: current.textColor, to: textColor };
  if (backgroundColor !== current.backgroundColor) changes.backgroundColor = { from: current.backgroundColor, to: backgroundColor };
  if (isFinal !== current.isFinal) changes.isFinal = { from: current.isFinal, to: isFinal };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar." };

  try {
    await db.update(jobStatus).set({ name, textColor, backgroundColor, isFinal }).where(eq(jobStatus.id, current.id));
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE;
    console.error(error);
    return { ok: false, error: "Não foi possível salvar o status." };
  }
  await recordAudit({
    action: "job_status.updated",
    actor: ctx.actor,
    entity: statusEntity({ id: current.id, name }),
    metadata: { changes },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Status “${name}” atualizado.` };
}

export async function deleteJobStatus(input: { statusId: string }): Promise<StatusActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = jobStatusTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const current = await findJobStatusById(db, parsed.data.statusId);
  if (!current) return NOT_FOUND;
  if (current.isDefault) return { ok: false, error: "Escolha outro status como padrão antes de excluir este." };
  const inUse = await countJobsWithStatus(db, current.id);
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} ${inUse === 1 ? "trabalho usa" : "trabalhos usam"} este status. Mude ${inUse === 1 ? "ele" : "eles"} de status antes de excluir.`,
    };
  }

  await db.delete(jobStatus).where(eq(jobStatus.id, current.id));
  await recordAudit({ action: "job_status.deleted", actor: ctx.actor, entity: statusEntity(current), ...ctx.meta });

  refresh();
  return { ok: true, message: `Status “${current.name}” excluído.` };
}

export async function setDefaultJobStatus(input: { statusId: string }): Promise<StatusActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = jobStatusTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };
  const current = await findJobStatusById(db, parsed.data.statusId);
  if (!current) return NOT_FOUND;
  if (current.isDefault) return { ok: true, message: `“${current.name}” já é o padrão.` };
  if (current.isFinal) return { ok: false, error: "Um status que encerra o trabalho não pode ser o padrão." };

  await db.batch([
    db.update(jobStatus).set({ isDefault: false }).where(ne(jobStatus.id, current.id)),
    db.update(jobStatus).set({ isDefault: true }).where(eq(jobStatus.id, current.id)),
  ]);
  await recordAudit({ action: "job_status.default_changed", actor: ctx.actor, entity: statusEntity(current), ...ctx.meta });

  refresh();
  return { ok: true, message: `Trabalhos novos começam em “${current.name}”.` };
}

/** Sobe ou desce um status na ordem (a ordem é a das listas de status). */
export async function moveJobStatus(input: { statusId: string; direction: "up" | "down" }): Promise<StatusActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = moveJobStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Status inválido." };

  const ordered = await db.select().from(jobStatus).orderBy(asc(jobStatus.position), asc(jobStatus.createdAt));
  const index = ordered.findIndex((row) => row.id === parsed.data.statusId);
  if (index < 0) return NOT_FOUND;
  const target = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return { ok: true, message: "Já está no limite." };

  const reordered = [...ordered];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const [first, ...rest] = reordered.map((row, position) =>
    db.update(jobStatus).set({ position }).where(eq(jobStatus.id, row.id)),
  );
  await db.batch([first, ...rest]);
  await recordAudit({
    action: "job_status.reordered",
    actor: ctx.actor,
    entity: statusEntity(ordered[index]),
    metadata: { order: reordered.map((row) => row.name) },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Ordem atualizada." };
}
