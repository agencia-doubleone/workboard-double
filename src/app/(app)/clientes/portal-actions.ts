"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { portalUser } from "@/db/schema";
import { env } from "@/env";
import type { AuditChanges } from "@/lib/audit";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { portalInviteEmail } from "@/lib/email/templates";
import { PORTAL_SIGN_IN_PATH } from "@/lib/portal";
import { getAdminSession } from "@/lib/session";
import {
  createPortalContactSchema,
  portalContactTargetSchema,
  setPortalContactDisabledSchema,
  updatePortalContactSchema,
  type CreatePortalContactInput,
  type UpdatePortalContactInput,
} from "@/lib/validations/portal";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { findClientById } from "@/server/clients";
import { deleteMediaByKey } from "@/server/media";
import { findPortalContact, findPortalContactByEmail, revokePortalSessions, type PortalContactRecord } from "@/server/portal";

// Acessos ao portal do cliente: só admins criam, editam, convidam, desativam e
// excluem, sempre pela página do cliente. Tudo fica na auditoria do cliente.

export type PortalActionResult =
  | { ok: true; message: string; warning?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const NOT_FOUND = { ok: false, error: "Acesso não encontrado." } as const;
const ARCHIVED = { ok: false, error: "O cliente está arquivado: reative-o antes de mexer nos acessos ao portal." } as const;

async function getAdminContext() {
  const adminSession = await getAdminSession();
  if (!adminSession) return null;
  return { actor: adminSession.user, meta: getRequestMeta(await headers()) };
}

function invalid(error: z.ZodError): PortalActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function clientEntity(found: Pick<PortalContactRecord, "client">) {
  return { type: "client" as const, id: found.client.id, label: found.client.name };
}

/** E-mail já usado por outro contato (o e-mail é único em todo o portal). */
async function emailTakenMessage(email: string, exceptId?: string) {
  const existing = await findPortalContactByEmail(db, email);
  if (!existing || existing.contact.id === exceptId) return null;
  return `Este e-mail já tem acesso ao portal (${existing.client.name}).`;
}

/** Manda o convite. Devolve o erro (o acesso continua valendo; o admin pode reenviar). */
async function sendInvite(found: PortalContactRecord, invitedBy: string) {
  try {
    await sendEmail(
      portalInviteEmail({
        to: found.contact.email,
        name: found.contact.name,
        clientName: found.client.name,
        url: `${env.BETTER_AUTH_URL}${PORTAL_SIGN_IN_PATH}`,
        invitedBy,
      }),
    );
    await db.update(portalUser).set({ invitedAt: new Date() }).where(eq(portalUser.id, found.contact.id));
    return null;
  } catch (error) {
    console.error("[email] falha no convite do portal", error);
    return error;
  }
}

export async function createPortalContact(input: CreatePortalContactInput): Promise<PortalActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = createPortalContactSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { clientId, name, email, canApprove, sendInvite: wantsInvite } = parsed.data;

  const target = await findClientById(db, clientId);
  if (!target) return { ok: false, error: "Cliente não encontrado." };
  if (target.archivedAt) return ARCHIVED;
  const taken = await emailTakenMessage(email);
  if (taken) return { ok: false, error: "Revise os campos destacados.", fieldErrors: { email: [taken] } };

  const id = randomUUID();
  await db.insert(portalUser).values({ id, name, email, canApprove, clientId: target.id, createdById: ctx.actor.id });
  const found = await findPortalContact(db, id);
  if (!found) return { ok: false, error: "Não foi possível criar o acesso." };

  const invite = wantsInvite && isEmailConfigured() ? await sendInvite(found, ctx.actor.name) : "skipped";
  await recordAudit({
    action: "portal_user.created",
    actor: ctx.actor,
    entity: clientEntity(found),
    metadata: { portalUserId: id, name, email, canApprove, invited: invite === null },
    ...ctx.meta,
  });

  refresh();
  if (invite === "skipped") return { ok: true, message: `Acesso criado para ${name}.` };
  if (invite) {
    return {
      ok: true,
      message: `Acesso criado para ${name}.`,
      warning: "O convite por e-mail falhou. Tente reenviar pelo menu do acesso ou mande o endereço do portal à pessoa.",
    };
  }
  return { ok: true, message: `Acesso criado. Convite enviado para ${email}.` };
}

export async function updatePortalContact(input: UpdatePortalContactInput): Promise<PortalActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = updatePortalContactSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const found = await findPortalContact(db, parsed.data.contactId);
  if (!found) return NOT_FOUND;
  if (found.client.archivedAt) return ARCHIVED;

  const { name, email, canApprove } = parsed.data;
  const changes: AuditChanges = {};
  if (name !== found.contact.name) changes.name = { from: found.contact.name, to: name };
  if (email !== found.contact.email) changes.email = { from: found.contact.email, to: email };
  if (canApprove !== found.contact.canApprove) changes.canApprove = { from: found.contact.canApprove, to: canApprove };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar." };
  if (changes.email) {
    const taken = await emailTakenMessage(email, found.contact.id);
    if (taken) return { ok: false, error: "Revise os campos destacados.", fieldErrors: { email: [taken] } };
  }

  await db.update(portalUser).set({ name, email, canApprove }).where(eq(portalUser.id, found.contact.id));
  // E-mail novo é outra pessoa entrando: as sessões abertas com o antigo caem.
  if (changes.email) await revokePortalSessions(db, found.contact.id);
  await recordAudit({
    action: "portal_user.updated",
    actor: ctx.actor,
    entity: clientEntity(found),
    metadata: { portalUserId: found.contact.id, changes },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Acesso atualizado." };
}

export async function resendPortalInvite(input: { contactId: string }): Promise<PortalActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = portalContactTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findPortalContact(db, parsed.data.contactId);
  if (!found) return NOT_FOUND;
  if (found.client.archivedAt) return ARCHIVED;
  if (found.contact.disabledAt) return { ok: false, error: "Reative o acesso antes de mandar o convite." };
  if (!isEmailConfigured()) return { ok: false, error: "O envio de e-mails não está configurado no servidor." };

  if (await sendInvite(found, ctx.actor.name)) {
    return { ok: false, error: "Não foi possível enviar o convite. Tente de novo em instantes." };
  }
  await recordAudit({
    action: "portal_user.invited",
    actor: ctx.actor,
    entity: clientEntity(found),
    metadata: { portalUserId: found.contact.id, email: found.contact.email },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `Convite reenviado para ${found.contact.email}.` };
}

export async function setPortalContactDisabled(input: { contactId: string; disabled: boolean }): Promise<PortalActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = setPortalContactDisabledSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findPortalContact(db, parsed.data.contactId);
  if (!found) return NOT_FOUND;
  const { disabled } = parsed.data;
  if (Boolean(found.contact.disabledAt) === disabled) {
    return { ok: true, message: disabled ? "O acesso já estava desativado." : "O acesso já estava ativo." };
  }

  await db.update(portalUser).set({ disabledAt: disabled ? new Date() : null }).where(eq(portalUser.id, found.contact.id));
  if (disabled) await revokePortalSessions(db, found.contact.id);
  await recordAudit({
    action: disabled ? "portal_user.disabled" : "portal_user.enabled",
    actor: ctx.actor,
    entity: clientEntity(found),
    metadata: { portalUserId: found.contact.id, email: found.contact.email },
    ...ctx.meta,
  });

  refresh();
  return {
    ok: true,
    message: disabled ? `${found.contact.name} não entra mais no portal.` : `${found.contact.name} voltou a ter acesso ao portal.`,
  };
}

export async function deletePortalContact(input: { contactId: string }): Promise<PortalActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  const parsed = portalContactTargetSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const found = await findPortalContact(db, parsed.data.contactId);
  if (!found) return NOT_FOUND;

  // As sessões saem junto (cascade); um código pedido antes deixa de valer (não há mais contato).
  await db.delete(portalUser).where(eq(portalUser.id, found.contact.id));
  // A foto do perfil do portal vai junto (como ao excluir um usuário da equipe).
  await deleteMediaByKey(db, found.contact.image, { actor: ctx.actor, meta: ctx.meta, audit: false });
  await recordAudit({
    action: "portal_user.deleted",
    actor: ctx.actor,
    entity: clientEntity(found),
    metadata: { portalUserId: found.contact.id, name: found.contact.name, email: found.contact.email },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `O acesso de ${found.contact.name} foi excluído.` };
}
