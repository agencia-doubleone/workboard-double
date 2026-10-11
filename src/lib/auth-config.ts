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

// Perfil e senha do próprio usuário também só por Server Actions
// (src/app/(app)/perfil/actions.ts): a foto precisa ser um arquivo do CDN
// enviado pela pessoa, e tudo fica na auditoria.
const PROFILE_HTTP_PATHS = ["/update-user", "/change-password"];

// O Better Auth engole erros do sendResetPassword (só loga). Este store
// permite a quem disparou o reset (o admin, em usuarios/actions.ts) saber se o
// e-mail falhou de verdade. Sem store, o pedido veio do "Esqueceu a senha?" do login.
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
  /**
   * Roda uma tarefa depois de responder (no Next, after()). O e-mail do "Esqueceu
   * a senha?" sai por aqui: esperar o SMTP só quando a conta existe deixaria a
   * resposta mais lenta e entregaria quais e-mails têm conta. Sem isso, espera.
   */
  runInBackground?: (task: () => Promise<void>) => void;
};

export function createAuth({ database, baseURL, secret, runInBackground }: CreateAuthOptions) {
  const recordAudit = createAuditRecorder(database);

  return betterAuth({
    appName: "Workboard",
    baseURL,
    secret,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    user: {
      additionalFields: {
        // Data de aniversário ("AAAA-MM-DD"), editada no perfil. Validada pelo
        // Zod da Server Action; o /update-user HTTP está desligado.
        birthday: { type: "string", required: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Sistema interno: contas são criadas por um admin, não há cadastro público.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN_HOURS * 60 * 60,
      // Nova senha pelo link derruba todas as sessões abertas.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        const delivery = resetDeliveryStore.getStore();
        const message = passwordResetEmail({
          to: user.email,
          name: user.name,
          url,
          expiresInHours: PASSWORD_RESET_EXPIRES_IN_HOURS,
          requestedBy: delivery ? "admin" : "self",
        });
        if (delivery) {
          try {
            await sendEmail(message);
          } catch (error) {
            delivery.error = error;
          }
          return;
        }

        // Pedido pelo login: conta desativada não recebe nada (e a resposta é a mesma).
        if ((user as { banned?: boolean | null }).banned) return;
        await recordAudit({
          action: "auth.password_reset_requested",
          actor: null,
          entity: userEntity(user),
          ...getRequestMeta(request?.headers),
        });
        const send = () =>
          sendEmail(message).catch((error) => console.error("[email] falha no envio do reset", error));
        if (runInBackground) runInBackground(send);
        else await send();
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
    // O /request-password-reset fica aberto: é o "Esqueceu a senha?" do login (o
    // Better Auth limita a 3 pedidos por minuto e responde igual exista ou não a conta).
    disabledPaths: [...ADMIN_HTTP_PATHS, ...PROFILE_HTTP_PATHS],
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
