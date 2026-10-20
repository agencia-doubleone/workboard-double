"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { portalUser } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { getPortalSession } from "@/lib/portal-session";
import {
  updatePortalAvatarSchema,
  updatePortalProfileSchema,
  type UpdatePortalAvatarInput,
  type UpdatePortalProfileInput,
} from "@/lib/validations/portal";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { deleteMediaByKey, findMediaById, isUploader } from "@/server/media";
import type { PortalContactRecord } from "@/server/portal";

// Perfil do contato no portal do cliente: cada um mexe só no próprio (o alvo é
// sempre o contato da sessão). Nome e foto; o e-mail, que é o login, só um admin troca.
// Na auditoria, o contato é um ator externo e o evento fica no histórico do cliente.

export type PortalProfileResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED: PortalProfileResult = { ok: false, error: "Sua sessão expirou. Entre de novo." };
const INVALID_PHOTO: PortalProfileResult = { ok: false, error: "Foto inválida. Envie de novo." };

async function getPortalContext() {
  const found = await getPortalSession();
  if (!found) return null;
  const { contact } = found;
  return {
    found,
    actor: { id: contact.id, name: contact.name, email: contact.email, external: true },
    meta: getRequestMeta(await headers()),
  };
}

function clientEntity({ client }: Pick<PortalContactRecord, "client">) {
  return { type: "client" as const, id: client.id, label: client.name };
}

export async function updatePortalProfile(input: UpdatePortalProfileInput): Promise<PortalProfileResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = updatePortalProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { contact } = ctx.found;
  const { name } = parsed.data;
  if (name === contact.name) return { ok: true, message: "Nada para salvar." };
  const changes: AuditChanges = { name: { from: contact.name, to: name } };

  await db.update(portalUser).set({ name }).where(eq(portalUser.id, contact.id));
  await recordAudit({
    action: "portal.profile_updated",
    actor: { ...ctx.actor, name },
    entity: clientEntity(ctx.found),
    metadata: { portalUserId: contact.id, changes },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Perfil atualizado." };
}

/** Usa uma foto já enviada por uploadMedia (via "portal") e apaga a anterior do CDN. */
export async function updatePortalAvatar(input: UpdatePortalAvatarInput): Promise<PortalProfileResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  const parsed = updatePortalAvatarSchema.safeParse(input);
  if (!parsed.success) return INVALID_PHOTO;

  // Só uma imagem que o próprio contato enviou para a pasta do portal.
  const photo = await findMediaById(db, parsed.data.mediaId);
  if (!photo || !isUploader(photo, ctx.actor) || photo.folder !== "portal" || !photo.type.startsWith("image/")) {
    return INVALID_PHOTO;
  }
  const { contact } = ctx.found;
  const previous = contact.image ?? null;
  if (previous === photo.key) return { ok: true, message: "Foto atualizada." };

  // A coluna guarda a chave do CDN; a URL sai de resolveMediaUrl na leitura.
  await db.update(portalUser).set({ image: photo.key }).where(eq(portalUser.id, contact.id));
  await deleteMediaByKey(db, previous, { actor: ctx.actor, meta: ctx.meta, audit: false });
  await recordAudit({
    action: "portal.photo_updated",
    actor: ctx.actor,
    entity: clientEntity(ctx.found),
    metadata: { portalUserId: contact.id, key: photo.key },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Foto atualizada." };
}

export async function removePortalAvatar(): Promise<PortalProfileResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;

  const { contact } = ctx.found;
  const previous = contact.image ?? null;
  if (!previous) return { ok: true, message: "Você já está sem foto." };

  await db.update(portalUser).set({ image: null }).where(eq(portalUser.id, contact.id));
  await deleteMediaByKey(db, previous, { actor: ctx.actor, meta: ctx.meta, audit: false });
  await recordAudit({
    action: "portal.photo_removed",
    actor: ctx.actor,
    entity: clientEntity(ctx.found),
    metadata: { portalUserId: contact.id },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Foto removida." };
}
