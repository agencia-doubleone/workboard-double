import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { portalAccount, portalRateLimit, portalSession, portalUser, portalVerification } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { portalCodeEmail } from "@/lib/email/templates";
import {
  PORTAL_AUTH_BASE_PATH,
  PORTAL_CODE_ATTEMPTS,
  PORTAL_CODE_EXPIRES_MINUTES,
  PORTAL_CODE_LENGTH,
  PORTAL_COOKIE_PREFIX,
  PORTAL_SESSION_DAYS,
} from "@/lib/portal";
import { createAuditRecorder, getRequestMeta } from "@/server/audit/recorder";
import { canUsePortal, findPortalContact, findPortalContactByEmail } from "@/server/portal";

// Autenticação do portal do cliente: um segundo Better Auth, separado do da
// equipe (src/lib/auth-config.ts), com tabelas (portal_*) e cookie próprios.
// A sessão de um contato não existe para as telas da equipe, e vice-versa.
// Entrada só por código no e-mail, e só para contatos que um admin cadastrou.

/**
 * As únicas rotas abertas. Tudo o mais do Better Auth (cadastro, senha, troca
 * de e-mail, contas sociais...) responde 404 no portal: lista de permitidas, não
 * de proibidas, para que uma rota nova do Better Auth não abra sozinha.
 */
const OPEN_PATHS = new Set(["/email-otp/send-verification-otp", "/sign-in/email-otp", "/get-session", "/sign-out", "/ok", "/error"]);

const CODE_REQUEST_PATH = "/email-otp/send-verification-otp";
const CODE_SIGN_IN_PATH = "/sign-in/email-otp";

type CreatePortalAuthOptions = {
  database: Database;
  baseURL: string;
  secret: string;
  /** Roda o envio do e-mail depois de responder (no Next, after()): sem isso, espera. */
  runInBackground?: (task: () => Promise<void>) => void;
};

export function createPortalAuth({ database, baseURL, secret, runInBackground }: CreatePortalAuthOptions) {
  const recordAudit = createAuditRecorder(database);

  return betterAuth({
    appName: "Workboard · Portal do cliente",
    baseURL,
    basePath: PORTAL_AUTH_BASE_PATH,
    secret,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { portalUser, portalSession, portalAccount, portalVerification, portalRateLimit },
    }),
    user: {
      modelName: "portalUser",
      // O Better Auth confere o schema ao subir: coluna obrigatória precisa ser
      // conhecida. Só a action do admin grava (input: false, ninguém manda pela API).
      additionalFields: { clientId: { type: "string", required: true, input: false } },
    },
    session: {
      modelName: "portalSession",
      expiresIn: PORTAL_SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    account: { modelName: "portalAccount" },
    verification: { modelName: "portalVerification" },
    rateLimit: { storage: "database", modelName: "portalRateLimit" },
    emailAndPassword: { enabled: false },
    advanced: { cookiePrefix: PORTAL_COOKIE_PREFIX },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!OPEN_PATHS.has(ctx.path)) throw new APIError("NOT_FOUND");
        // Só código de entrada: os de senha, verificação e troca de e-mail não existem no portal.
        if (ctx.path === CODE_REQUEST_PATH && ctx.body?.type !== "sign-in") throw new APIError("BAD_REQUEST");
        // Contato desativado (ou de cliente arquivado) não entra nem com um código
        // pedido antes: mesma resposta de código errado, sem contar o motivo.
        if (ctx.path === CODE_SIGN_IN_PATH) {
          const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
          if (!canUsePortal(await findPortalContactByEmail(database, email))) {
            throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== CODE_SIGN_IN_PATH) return;
        const newSession = ctx.context.newSession;
        if (!newSession) return;
        const found = await findPortalContact(database, newSession.user.id);
        if (!found) return;
        await database.update(portalUser).set({ lastSignInAt: new Date() }).where(eq(portalUser.id, found.contact.id));
        await recordAudit({
          action: "portal.sign_in",
          actor: { id: found.contact.id, name: found.contact.name, email: found.contact.email, external: true },
          entity: { type: "client", id: found.client.id, label: found.client.name },
          metadata: { portalUserId: found.contact.id },
          ...getRequestMeta(ctx.headers ?? ctx.request?.headers),
        });
      }),
    },
    plugins: [
      emailOTP({
        otpLength: PORTAL_CODE_LENGTH,
        expiresIn: PORTAL_CODE_EXPIRES_MINUTES * 60,
        allowedAttempts: PORTAL_CODE_ATTEMPTS,
        // Ninguém se cadastra: e-mail sem contato recebe a mesma resposta e nenhum código.
        disableSignUp: true,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          const found = await findPortalContactByEmail(database, email);
          if (!found || !canUsePortal(found)) return;
          const message = portalCodeEmail({
            to: found.contact.email,
            name: found.contact.name,
            code: otp,
            expiresInMinutes: PORTAL_CODE_EXPIRES_MINUTES,
          });
          // Depois de responder: o tempo da resposta não entrega quais e-mails têm acesso.
          const send = () =>
            sendEmail(message).catch((error) => console.error("[email] falha no código do portal", error));
          if (runInBackground) runInBackground(send);
          else await send();
        },
      }),
      // Precisa ser o último plugin.
      nextCookies(),
    ],
  });
}
