"use server";

import { isAPIError } from "better-auth/api";
import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { session } from "@/db/schema";
import type { AuditChanges } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { captureResetDelivery } from "@/lib/auth-config";
import { isEmailConfigured } from "@/lib/email";
import { generatePassword } from "@/lib/password";
import { getAdminSession } from "@/lib/session";
import { PASSWORD_RESET_EXPIRES_IN_HOURS } from "@/lib/users";
import {
  createUserSchema,
  setUserActiveSchema,
  setUserPasswordSchema,
  updateUserSchema,
  userTargetSchema,
  type CreateUserInput,
  type SetUserActiveInput,
  type SetUserPasswordInput,
  type UpdateUserInput,
} from "@/lib/validations/users";
import { getRequestMeta, recordAudit, userEntity } from "@/server/audit";
import { countActiveSessions, findUserById, isEmailTaken } from "@/server/users";

export type ActionResult =
  | { ok: true; message: string; /** Só ao criar usuário sem senha. */ generatedPassword?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const FORBIDDEN: ActionResult = { ok: false, error: "Você não tem permissão para esta ação." };
const NOT_FOUND: ActionResult = { ok: false, error: "Usuário não encontrado." };

const API_ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe um usuário com este e-mail.",
  YOU_CANNOT_BAN_YOURSELF: "Você não pode desativar a própria conta.",
  YOU_CANNOT_REMOVE_YOURSELF: "Você não pode excluir a própria conta.",
  PASSWORD_TOO_SHORT: "A senha é curta demais.",
  PASSWORD_TOO_LONG: "A senha é longa demais.",
  USER_NOT_FOUND: "Usuário não encontrado.",
};

/** Revalida o admin a cada chamada: nunca confiar no cliente. */
async function getAdminContext() {
  const adminSession = await getAdminSession();
  if (!adminSession) return null;
  const requestHeaders = await headers();
  return {
    headers: requestHeaders,
    actor: adminSession.user,
    sessionId: adminSession.session.id,
    meta: getRequestMeta(requestHeaders),
  };
}

function invalid(error: z.ZodError): ActionResult {
  return {
    ok: false,
    error: "Revise os campos destacados.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function failure(error: unknown, fallback: string): ActionResult {
  if (isAPIError(error)) {
    const code = error.body?.code;
    if (code && API_ERROR_MESSAGES[code]) return { ok: false, error: API_ERROR_MESSAGES[code] };
  }
  console.error(error);
  return { ok: false, error: fallback };
}

/** Encerra as outras sessões do próprio admin, mantendo a atual. */
async function revokeOwnOtherSessions(userId: string, currentSessionId: string) {
  await db
    .delete(session)
    .where(and(eq(session.userId, userId), ne(session.id, currentSessionId)));
}

function sessionsLabel(total: number) {
  if (total === 0) return "nenhuma sessão estava aberta";
  return total === 1 ? "1 sessão encerrada" : `${total} sessões encerradas`;
}

export async function createUser(input: CreateUserInput): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { name, email, role } = parsed.data;
  const passwordGenerated = !parsed.data.password;
  const password = parsed.data.password ?? generatePassword();

  if (await isEmailTaken(db, email)) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: { email: ["Já existe um usuário com este e-mail."] },
    };
  }

  try {
    const { user: created } = await auth.api.createUser({
      body: { name, email, password, role, data: { emailVerified: true } },
      headers: ctx.headers,
    });
    await recordAudit({
      action: "user.created",
      actor: ctx.actor,
      entity: userEntity(created),
      metadata: { name, role, passwordGenerated },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível criar o usuário.");
  }

  refresh();
  return {
    ok: true,
    message: `${name} foi adicionado.`,
    generatedPassword: passwordGenerated ? password : undefined,
  };
}

export async function updateUser(input: UpdateUserInput): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { userId, name, email, role } = parsed.data;

  const target = await findUserById(db, userId);
  if (!target) return NOT_FOUND;

  if (target.id === ctx.actor.id && role !== target.role) {
    return { ok: false, error: "Você não pode alterar o próprio papel." };
  }
  if (email !== target.email && (await isEmailTaken(db, email, target.id))) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: { email: ["Já existe um usuário com este e-mail."] },
    };
  }

  const changes: AuditChanges = {};
  if (name !== target.name) changes.name = { from: target.name, to: name };
  if (email !== target.email) changes.email = { from: target.email, to: email };
  if (role !== target.role) changes.role = { from: target.role, to: role };
  if (Object.keys(changes).length === 0) return { ok: true, message: "Nada para salvar." };

  try {
    if (changes.name || changes.email) {
      await auth.api.adminUpdateUser({
        body: { userId, data: { name, email } },
        headers: ctx.headers,
      });
    }
    if (changes.role) {
      await auth.api.setRole({ body: { userId, role }, headers: ctx.headers });
    }
    await recordAudit({
      action: "user.updated",
      actor: ctx.actor,
      entity: userEntity({ id: userId, email }),
      metadata: { changes },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível salvar as alterações.");
  }

  refresh();
  return { ok: true, message: "Alterações salvas." };
}

export async function setUserPassword(input: SetUserPasswordInput): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = setUserPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { userId, password } = parsed.data;

  const target = await findUserById(db, userId);
  if (!target) return NOT_FOUND;
  const isSelf = target.id === ctx.actor.id;

  let revoked: number;
  try {
    const before = await countActiveSessions(db, userId);
    await auth.api.setUserPassword({
      body: { userId, newPassword: password },
      headers: ctx.headers,
    });
    // Senha nova = sessões antigas não valem mais.
    if (isSelf) {
      await revokeOwnOtherSessions(userId, ctx.sessionId);
      revoked = Math.max(0, before - 1);
    } else {
      await auth.api.revokeUserSessions({ body: { userId }, headers: ctx.headers });
      revoked = before;
    }
    await recordAudit({
      action: "user.password_set",
      actor: ctx.actor,
      entity: userEntity(target),
      metadata: { sessionsRevoked: revoked },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível alterar a senha.");
  }

  refresh();
  return {
    ok: true,
    message: isSelf
      ? "Senha alterada. Suas outras sessões foram encerradas."
      : `Senha de ${target.name} alterada (${sessionsLabel(revoked)}).`,
  };
}

export async function sendPasswordReset(input: { userId: string }): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isEmailConfigured()) {
    return { ok: false, error: "O envio de e-mails ainda não está configurado." };
  }

  const parsed = userTargetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const target = await findUserById(db, parsed.data.userId);
  if (!target) return NOT_FOUND;
  if (target.banned) {
    return { ok: false, error: "Reative o usuário antes de enviar o link." };
  }

  try {
    const { error } = await captureResetDelivery(() =>
      auth.api.requestPasswordReset({
        body: { email: target.email, redirectTo: "/redefinir-senha" },
        headers: ctx.headers,
      }),
    );
    if (error) {
      console.error("[email] falha no envio do reset", error);
      return { ok: false, error: "Não foi possível enviar o e-mail. Tente novamente." };
    }
    await recordAudit({
      action: "user.password_reset_sent",
      actor: ctx.actor,
      entity: userEntity(target),
      metadata: { expiresInHours: PASSWORD_RESET_EXPIRES_IN_HOURS },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível gerar o link de redefinição.");
  }

  return {
    ok: true,
    message:
      process.env.NODE_ENV === "production"
        ? `Link enviado para ${target.email}.`
        : "Link gerado. Em desenvolvimento, o e-mail aparece no terminal do servidor.",
  };
}

export async function setUserActive(input: SetUserActiveInput): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { userId, active, reason } = parsed.data;

  const target = await findUserById(db, userId);
  if (!target) return NOT_FOUND;
  if (target.id === ctx.actor.id) {
    return { ok: false, error: "Você não pode desativar a própria conta." };
  }
  if (active === !target.banned) {
    return { ok: true, message: active ? "O usuário já está ativo." : "O usuário já está inativo." };
  }

  let message: string;
  try {
    if (active) {
      await auth.api.unbanUser({ body: { userId }, headers: ctx.headers });
      await recordAudit({
        action: "user.activated",
        actor: ctx.actor,
        entity: userEntity(target),
        ...ctx.meta,
      });
      message = `${target.name} foi reativado.`;
    } else {
      const sessions = await countActiveSessions(db, userId);
      // banUser também apaga todas as sessões do usuário.
      await auth.api.banUser({
        body: { userId, banReason: reason || undefined },
        headers: ctx.headers,
      });
      await recordAudit({
        action: "user.deactivated",
        actor: ctx.actor,
        entity: userEntity(target),
        metadata: { reason: reason || null, sessionsRevoked: sessions },
        ...ctx.meta,
      });
      message = `${target.name} foi desativado (${sessionsLabel(sessions)}).`;
    }
  } catch (error) {
    return failure(error, "Não foi possível alterar o status do usuário.");
  }

  refresh();
  return { ok: true, message };
}

export async function revokeUserSessions(input: { userId: string }): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = userTargetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const target = await findUserById(db, parsed.data.userId);
  if (!target) return NOT_FOUND;
  const isSelf = target.id === ctx.actor.id;

  let revoked: number;
  try {
    const before = await countActiveSessions(db, target.id);
    if (isSelf) {
      await revokeOwnOtherSessions(target.id, ctx.sessionId);
      revoked = Math.max(0, before - 1);
    } else {
      await auth.api.revokeUserSessions({ body: { userId: target.id }, headers: ctx.headers });
      revoked = before;
    }
    await recordAudit({
      action: "user.sessions_revoked",
      actor: ctx.actor,
      entity: userEntity(target),
      metadata: { sessionsRevoked: revoked, onlyOtherSessions: isSelf },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível encerrar as sessões.");
  }

  refresh();
  return {
    ok: true,
    message: isSelf
      ? "Suas outras sessões foram encerradas."
      : `Sessões de ${target.name}: ${sessionsLabel(revoked)}.`,
  };
}

export async function deleteUser(input: { userId: string }): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const parsed = userTargetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const target = await findUserById(db, parsed.data.userId);
  if (!target) return NOT_FOUND;
  if (target.id === ctx.actor.id) {
    return { ok: false, error: "Você não pode excluir a própria conta." };
  }

  try {
    const sessions = await countActiveSessions(db, target.id);
    // Remove sessões, contas e o usuário. Na auditoria, os eventos ficam
    // (actor_id vira null, nome/e-mail continuam copiados no registro).
    await auth.api.removeUser({ body: { userId: target.id }, headers: ctx.headers });
    await recordAudit({
      action: "user.deleted",
      actor: ctx.actor,
      entity: userEntity(target),
      metadata: { name: target.name, role: target.role, sessionsRevoked: sessions },
      ...ctx.meta,
    });
  } catch (error) {
    return failure(error, "Não foi possível excluir o usuário.");
  }

  refresh();
  return { ok: true, message: `${target.name} foi excluído.` };
}
