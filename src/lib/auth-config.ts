import { AsyncLocalStorage } from "node:async_hooks";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email/templates";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_EXPIRES_IN_HOURS,
} from "@/lib/users";
import { createAuditRecorder, getRequestMeta, userEntity } from "@/server/audit/recorder";

// Endpoints do plugin admin ficam fechados para HTTP: o admin só age pelas
// Server Actions (que validam e auditam), chamando auth.api no servidor.
const ADMIN_HTTP_PATHS = [
  "/admin/create-user",
  "/admin/update-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/remove-user",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/list-users",
  "/admin/list-user-sessions",
  "/admin/get-user",
  "/admin/has-permission",
];

// O Better Auth engole erros do sendResetPassword (só loga). Este store
// permite a quem disparou o reset saber se o e-mail falhou de verdade.
type ResetDelivery = { error?: unknown };
const resetDeliveryStore = new AsyncLocalStorage<ResetDelivery>();

export async function captureResetDelivery<T>(run: () => Promise<T>) {
  const delivery: ResetDelivery = {};
  const result = await resetDeliveryStore.run(delivery, run);
  return { result, error: delivery.error };
}

type CreateAuthOptions = {
  database: Database;
  baseURL: string;
  secret: string;
};

export function createAuth({ database, baseURL, secret }: CreateAuthOptions) {
  const recordAudit = createAuditRecorder(database);

  return betterAuth({
    appName: "Workboard",
    baseURL,
    secret,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      // Sistema interno: contas são criadas por um admin, não há cadastro público.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN_HOURS * 60 * 60,
      // Nova senha pelo link derruba todas as sessões abertas.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        try {
          await sendEmail(
            passwordResetEmail({
              to: user.email,
              name: user.name,
              url,
              expiresInHours: PASSWORD_RESET_EXPIRES_IN_HOURS,
            }),
          );
        } catch (error) {
          const delivery = resetDeliveryStore.getStore();
          if (!delivery) throw error;
          delivery.error = error;
        }
      },
      onPasswordReset: async ({ user }, request) => {
        await recordAudit({
          action: "auth.password_reset",
          actor: user,
          entity: userEntity(user),
          ...getRequestMeta(request?.headers),
        });
      },
    },
    rateLimit: {
      // Em memória não funciona bem em serverless (cada instância tem seu contador).
      storage: "database",
    },
    // Reset de senha por enquanto só é disparado pelo admin.
    disabledPaths: [...ADMIN_HTTP_PATHS, "/request-password-reset"],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-out") return;
        const session = await getSessionFromCtx(ctx);
        if (!session) return;
        await recordAudit({
          action: "auth.sign_out",
          actor: session.user,
          entity: userEntity(session.user),
          ...getRequestMeta(ctx.headers ?? ctx.request?.headers),
        });
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const meta = getRequestMeta(ctx.headers ?? ctx.request?.headers);

        const newSession = ctx.context.newSession;
        if (newSession) {
          await recordAudit({
            action: "auth.sign_in",
            actor: newSession.user,
            entity: userEntity(newSession.user),
            ...meta,
          });
          return;
        }

        const returned = ctx.context.returned;
        if (!isAPIError(returned)) return;
        const email =
          typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : null;
        const target = email
          ? await ctx.context.internalAdapter.findUserByEmail(email)
          : null;
        await recordAudit({
          action: "auth.sign_in_failed",
          actor: null,
          entity: target ? userEntity(target.user) : undefined,
          metadata: { email, reason: returned.body?.code ?? returned.status },
          ...meta,
        });
      }),
    },
    plugins: [
      admin(),
      // Precisa ser o último plugin.
      nextCookies(),
    ],
  });
}
