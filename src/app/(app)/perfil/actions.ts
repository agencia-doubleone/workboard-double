"use server";

import { isAPIError } from "better-auth/api";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";
import {
  changePasswordSchema,
  updateAvatarSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateAvatarInput,
  type UpdateProfileInput,
} from "@/lib/validations/profile";
import { getRequestMeta, recordAudit, userEntity } from "@/server/audit";
import { deleteMediaByKey, findMediaById } from "@/server/media";
import { countActiveSessions } from "@/server/users";

// Cada um só edita o próprio perfil: o alvo é sempre o usuário da sessão.
// Os endpoints HTTP equivalentes do Better Auth estão desligados (auth-config).

export type ProfileActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const UNAUTHENTICATED: ProfileActionResult = { ok: false, error: "Sua sessão expirou. Entre de novo." };

const API_ERROR_MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: "A senha é curta demais.",
  PASSWORD_TOO_LONG: "A senha é longa demais.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Sua conta não tem senha cadastrada. Fale com um administrador.",
};

async function getProfileContext() {
  const session = await getSession();
  if (!session) return null;
  const requestHeaders = await headers();
  return { headers: requestHeaders, user: session.user, meta: getRequestMeta(requestHeaders) };
}

function invalid(error: z.ZodError): ProfileActionResult {
  return {
    ok: false,
    error: "Revise os campos destacados.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function failure(error: unknown, fallback: string): ProfileActionResult {
  if (isAPIError(error)) {
    const code = error.body?.code;
    if (code && API_ERROR_MESSAGES[code]) return { ok: false, error: API_ERROR_MESSAGES[code] };
  }
  console.error(error);
  return { ok: false, error: fallback };
}

export async function updateProfile(input: UpdateProfileInput): Promise<ProfileActionResult> {
  const ctx = await getProfileContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { name } = parsed.data;
  if (name === ctx.user.name) return { ok: true, message: "Nada para salvar." };

  try {
    await auth.api.updateUser({ body: { name }, headers: ctx.headers });
    await recordAudit({
      action: "profile.updated",
      actor: ctx.user,
      entity: userEntity(ctx.user),
      metadata: { changes: { name: { from: ctx.user.name, to: name } } },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível salvar o perfil.");
  }

  refresh();
  return { ok: true, message: "Perfil atualizado." };
}

/** Usa uma foto já enviada por uploadMedia e apaga a anterior do CDN. */
export async function updateAvatar(input: UpdateAvatarInput): Promise<ProfileActionResult> {
  const ctx = await getProfileContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = updateAvatarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Foto inválida. Envie de novo." };

  // Só um arquivo de imagem que a própria pessoa enviou para a pasta de usuários.
  const photo = await findMediaById(db, parsed.data.mediaId);
  if (
    !photo ||
    photo.uploadedById !== ctx.user.id ||
    photo.folder !== "usuarios" ||
    !photo.type.startsWith("image/")
  ) {
    return { ok: false, error: "Foto inválida. Envie de novo." };
  }
  const previous = ctx.user.image ?? null;
  if (previous === photo.key) return { ok: true, message: "Foto atualizada." };

  try {
    // user.image guarda a chave no CDN; a URL sai de resolveMediaUrl na leitura.
    await auth.api.updateUser({ body: { image: photo.key }, headers: ctx.headers });
  } catch (error) {
    return failure(error, "Não foi possível salvar a foto.");
  }
  await deleteMediaByKey(db, previous, { actor: ctx.user, meta: ctx.meta, audit: false });
  await recordAudit({
    action: "profile.photo_updated",
    actor: ctx.user,
    entity: userEntity(ctx.user),
    metadata: { key: photo.key },
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Foto atualizada." };
}

export async function removeAvatar(): Promise<ProfileActionResult> {
  const ctx = await getProfileContext();
  if (!ctx) return UNAUTHENTICATED;

  const previous = ctx.user.image ?? null;
  if (!previous) return { ok: true, message: "Você já está sem foto." };

  try {
    await auth.api.updateUser({ body: { image: null }, headers: ctx.headers });
  } catch (error) {
    return failure(error, "Não foi possível remover a foto.");
  }
  await deleteMediaByKey(db, previous, { actor: ctx.user, meta: ctx.meta, audit: false });
  await recordAudit({
    action: "profile.photo_removed",
    actor: ctx.user,
    entity: userEntity(ctx.user),
    ...ctx.meta,
  });

  refresh();
  return { ok: true, message: "Foto removida." };
}

/** Exige a senha atual. A sessão atual continua; as outras são encerradas. */
export async function changePassword(input: ChangePasswordInput): Promise<ProfileActionResult> {
  const ctx = await getProfileContext();
  if (!ctx) return UNAUTHENTICATED;

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { currentPassword, newPassword } = parsed.data;

  try {
    const before = await countActiveSessions(db, ctx.user.id);
    // revokeOtherSessions apaga todas e cria uma sessão nova para este navegador
    // (o cookie é trocado pelo plugin nextCookies).
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: ctx.headers,
    });
    await recordAudit({
      action: "auth.password_changed",
      actor: ctx.user,
      entity: userEntity(ctx.user),
      metadata: { sessionsRevoked: Math.max(0, before - 1) },
      ...ctx.meta,
    });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: { currentPassword: ["Senha atual incorreta."] },
      };
    }
    return failure(error, "Não foi possível alterar a senha.");
  }

  return { ok: true, message: "Senha alterada. Suas outras sessões foram encerradas." };
}
