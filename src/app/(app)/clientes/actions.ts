"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { client, clientCredential } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { CLIENT_LINK_KEYS, formatAgeRange, formatGenders, formatSocialClasses } from "@/lib/clients";
import { getAdminSession } from "@/lib/session";
import {
  clientSchema,
  createCredentialSchema,
  credentialTargetSchema,
  revealCredentialSchema,
  updateClientSchema,
  updateCredentialSchema,
  type ClientInput,
  type CreateCredentialInput,
  type UpdateClientInput,
  type UpdateCredentialInput,
} from "@/lib/validations/clients";
import { getRequestMeta, recordAudit } from "@/server/audit";
import {
  findActiveClientById,
  findClientById,
  findCredentialById,
  generateClientSlug,
  type ClientRecord,
} from "@/server/clients";
import { deleteMediaByKey, findMediaById } from "@/server/media";
import { richTextExcerpt, sanitizeRichText } from "@/server/rich-text";
import { decryptSecret, encryptSecret, isVaultConfigured } from "@/server/vault";

// Só admins cadastram, editam e arquivam clientes e mexem no cofre; a equipe
// consulta. Ninguém exclui cliente: quem sai é arquivado.

export type ClientActionResult =
  | { ok: true; message: string; slug?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export type RevealCredentialResult =
  | { ok: true; password: string; notes: string | null }
  | { ok: false; error: string };

const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const CLIENT_NOT_FOUND = { ok: false, error: "Cliente não encontrado." } as const;
const CREDENTIAL_NOT_FOUND = { ok: false, error: "Acesso não encontrado." } as const;
const VAULT_OFF = {
  ok: false,
  error: "O cofre de senhas não está configurado no servidor (VAULT_ENCRYPTION_KEY).",
} as const;

/** Revalida o admin a cada chamada: nunca confiar no cliente. */
async function getAdminContext() {
  const adminSession = await getAdminSession();
  if (!adminSession) return null;
  const requestHeaders = await headers();
  return { actor: adminSession.user, meta: getRequestMeta(requestHeaders) };
}

function invalid(error: z.ZodError): ClientActionResult {
  return { ok: false, error: "Revise os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors };
}

function clientEntity(row: { id: string; name: string }) {
  return { type: "client" as const, id: row.id, label: row.name };
}

/** Logo novo: uma imagem que o próprio admin enviou para a pasta "clientes". */
async function resolveLogo(mediaId: string, actorId: string) {
  const logo = await findMediaById(db, mediaId);
  if (!logo || logo.uploadedById !== actorId || logo.folder !== "clientes" || !logo.type.startsWith("image/")) {
    return null;
  }
  return logo.key;
}

type ClientValues = Pick<
  ClientRecord,
  "name" | "website" | "instagram" | "facebook" | "linkedin" | "youtube" | "ageMin" | "ageMax" | "genders" | "socialClasses" | "notes"
>;

/** Diferenças entre dois estados do cliente, já em texto legível para a auditoria. */
function diffClient(before: ClientValues & { logoKey: string | null }, after: ClientValues & { logoKey: string | null }) {
  const changes: AuditChanges = {};
  if (before.name !== after.name) changes.name = { from: before.name, to: after.name };
  for (const key of CLIENT_LINK_KEYS) {
    if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] };
  }
  if (before.ageMin !== after.ageMin || before.ageMax !== after.ageMax) {
    changes.ageRange = { from: formatAgeRange(before.ageMin, before.ageMax), to: formatAgeRange(after.ageMin, after.ageMax) };
  }
  if (formatGenders(before.genders) !== formatGenders(after.genders)) {
    changes.genders = { from: formatGenders(before.genders), to: formatGenders(after.genders) };
  }
  if (formatSocialClasses(before.socialClasses) !== formatSocialClasses(after.socialClasses)) {
    changes.socialClasses = { from: formatSocialClasses(before.socialClasses), to: formatSocialClasses(after.socialClasses) };
  }
  if ((before.notes ?? null) !== (after.notes ?? null)) {
    changes.notes = { from: richTextExcerpt(before.notes), to: richTextExcerpt(after.notes) };
  }
  if (before.logoKey !== after.logoKey) {
    changes.logo = { from: before.logoKey ? "Com logo" : "Sem logo", to: after.logoKey ? "Novo logo" : "Sem logo" };
  }
  return changes;
}

function toValues(data: z.output<typeof clientSchema>): ClientValues {
  return {
    name: data.name,
    website: data.website,
    instagram: data.instagram,
    facebook: data.facebook,
    linkedin: data.linkedin,
    youtube: data.youtube,
    ageMin: data.ageMin,
    ageMax: data.ageMax,
    genders: data.genders,
    socialClasses: data.socialClasses,
    notes: sanitizeRichText(data.notes),
  };
}

export async function createClient(input: ClientInput): Promise<ClientActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const values = toValues(parsed.data);

  let logoKey: string | null = null;
  if (parsed.data.logoMediaId) {
    logoKey = await resolveLogo(parsed.data.logoMediaId, ctx.actor.id);
    if (!logoKey) return { ok: false, error: "Logo inválido. Envie de novo." };
  }

  try {
    const slug = await generateClientSlug(db, values.name);
    const [created] = await db
      .insert(client)
      .values({ ...values, slug, logoKey, createdById: ctx.actor.id })
      .returning({ id: client.id, name: client.name, slug: client.slug });
    await recordAudit({
      action: "client.created",
      actor: ctx.actor,
      entity: clientEntity(created),
      metadata: { slug: created.slug },
      ...ctx.meta,
    });
    return { ok: true, message: "Cliente cadastrado.", slug: created.slug };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível cadastrar o cliente." };
  }
}

export async function updateClient(input: UpdateClientInput): Promise<ClientActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const current = await findClientById(db, parsed.data.clientId);
  if (!current) return CLIENT_NOT_FOUND;

  const values = toValues(parsed.data);
  let logoKey = current.logoKey;
  if (parsed.data.logoMediaId === null) logoKey = null;
  else if (parsed.data.logoMediaId) {
    const uploaded = await resolveLogo(parsed.data.logoMediaId, ctx.actor.id);
    if (!uploaded) return { ok: false, error: "Logo inválido. Envie de novo." };
    logoKey = uploaded;
  }

  const changes = diffClient(current, { ...values, logoKey });
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar.", slug: current.slug };

  try {
    await db.update(client).set({ ...values, logoKey }).where(eq(client.id, current.id));
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Não foi possível salvar o cliente." };
  }
  // O logo anterior sai do CDN depois de salvar (falha aqui só vai para o log).
  if (current.logoKey && current.logoKey !== logoKey) {
    await deleteMediaByKey(db, current.logoKey, { actor: ctx.actor, meta: ctx.meta, audit: false });
  }
  await recordAudit({
    action: "client.updated",
    actor: ctx.actor,
    entity: clientEntity({ id: current.id, name: values.name }),
    metadata: { changes },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Cliente atualizado.", slug: current.slug };
}

export async function setClientArchived(input: { clientId: string; archived: boolean }): Promise<ClientActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = z.object({ clientId: z.uuid(), archived: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cliente inválido." };
  const current = await findClientById(db, parsed.data.clientId);
  if (!current) return CLIENT_NOT_FOUND;
  const { archived } = parsed.data;
  if (Boolean(current.archivedAt) === archived) {
    return { ok: true, message: archived ? "O cliente já estava arquivado." : "O cliente já estava ativo." };
  }

  await db.update(client).set({ archivedAt: archived ? new Date() : null }).where(eq(client.id, current.id));
  await recordAudit({
    action: archived ? "client.archived" : "client.restored",
    actor: ctx.actor,
    entity: clientEntity(current),
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: archived ? `${current.name} foi arquivado.` : `${current.name} foi reativado.` };
}

// Cofre de senhas

export async function createCredential(input: CreateCredentialInput): Promise<ClientActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isVaultConfigured()) return VAULT_OFF;

  const parsed = createCredentialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const target = await findActiveClientById(db, parsed.data.clientId);
  if (!target) return CLIENT_NOT_FOUND;

  const { service, url, username, password, notes } = parsed.data;
  // O id é gerado aqui porque entra na cifra (amarra o segredo ao registro).
  const id = randomUUID();
  await db.insert(clientCredential).values({
    id,
    clientId: target.id,
    service,
    url,
    username,
    passwordEncrypted: encryptSecret(password, id),
    notesEncrypted: notes ? encryptSecret(notes, id) : null,
    createdById: ctx.actor.id,
    updatedById: ctx.actor.id,
  });
  await recordAudit({
    action: "client.credential_created",
    actor: ctx.actor,
    entity: clientEntity(target),
    metadata: { credentialId: id, service },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Acesso adicionado ao cofre." };
}

export async function updateCredential(input: UpdateCredentialInput): Promise<ClientActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isVaultConfigured()) return VAULT_OFF;

  const parsed = updateCredentialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const found = await findCredentialById(db, parsed.data.credentialId);
  if (!found) return CREDENTIAL_NOT_FOUND;
  const { credential: current } = found;

  const { service, url, username, password, notes } = parsed.data;
  let currentNotes: string | null;
  try {
    currentNotes = current.notesEncrypted ? decryptSecret(current.notesEncrypted, current.id) : null;
  } catch (error) {
    console.error("[vault] não foi possível decifrar", current.id, error);
    return { ok: false, error: "Não foi possível abrir este acesso. A chave do cofre mudou?" };
  }

  // Senhas e observações nunca entram na auditoria: só a indicação de que mudaram.
  const changes: AuditChanges = {};
  if (service !== current.service) changes.service = { from: current.service, to: service };
  if (url !== current.url) changes.url = { from: current.url, to: url };
  if (username !== current.username) changes.username = { from: current.username, to: username };
  if (password) changes.password = { from: "••••••", to: "Nova senha" };
  if (notes !== currentNotes) changes.notes = { from: currentNotes ? "••••••" : null, to: notes ? "Alteradas" : null };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar." };

  await db
    .update(clientCredential)
    .set({
      service,
      url,
      username,
      ...(password ? { passwordEncrypted: encryptSecret(password, current.id) } : {}),
      notesEncrypted: notes ? encryptSecret(notes, current.id) : null,
      updatedById: ctx.actor.id,
    })
    .where(eq(clientCredential.id, current.id));
  await recordAudit({
    action: "client.credential_updated",
    actor: ctx.actor,
    entity: clientEntity(found.client),
    metadata: { credentialId: current.id, service, changes },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Acesso atualizado." };
}

export async function deleteCredential(input: { credentialId: string }): Promise<ClientActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = credentialTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Acesso inválido." };
  const found = await findCredentialById(db, parsed.data.credentialId);
  if (!found) return CREDENTIAL_NOT_FOUND;

  await db.delete(clientCredential).where(eq(clientCredential.id, found.credential.id));
  await recordAudit({
    action: "client.credential_deleted",
    actor: ctx.actor,
    entity: clientEntity(found.client),
    metadata: { credentialId: found.credential.id, service: found.credential.service },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: `${found.credential.service} foi removido do cofre.` };
}

/** Decifra a senha (e as observações) para um admin. Cada chamada fica na auditoria. */
export async function revealCredential(input: {
  credentialId: string;
  purpose: "view" | "copy";
}): Promise<RevealCredentialResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isVaultConfigured()) return VAULT_OFF;

  const parsed = revealCredentialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Acesso inválido." };
  const found = await findCredentialById(db, parsed.data.credentialId);
  if (!found) return CREDENTIAL_NOT_FOUND;
  const { credential } = found;

  let password: string;
  let notes: string | null;
  try {
    password = decryptSecret(credential.passwordEncrypted, credential.id);
    notes = credential.notesEncrypted ? decryptSecret(credential.notesEncrypted, credential.id) : null;
  } catch (error) {
    console.error("[vault] não foi possível decifrar", credential.id, error);
    return { ok: false, error: "Não foi possível abrir este acesso. A chave do cofre mudou?" };
  }

  await recordAudit({
    action: parsed.data.purpose === "copy" ? "client.credential_copied" : "client.credential_viewed",
    actor: ctx.actor,
    entity: clientEntity(found.client),
    metadata: { credentialId: credential.id, service: credential.service },
    ...ctx.meta,
  });
  return { ok: true, password, notes };
}
