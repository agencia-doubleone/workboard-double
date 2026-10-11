import { z } from "zod";

/** Variável opcional: ausente ou vazia ("") conta como não definida. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    // Storage de arquivos (CDN na KingHost). Sem as duas, o upload fica desligado.
    MEDIA_CDN_URL: optional(z.url().transform((url) => url.replace(/\/+$/, ""))),
    MEDIA_SIGNING_SECRET: optional(z.string().min(32)),
    // Tempo real (Worker no Cloudflare, veja realtime/README.md). Sem as duas,
    // notificações e chat continuam funcionando, só que atualizando de tempos em tempos.
    REALTIME_URL: optional(z.url().transform((url) => url.replace(/\/+$/, ""))),
    REALTIME_SECRET: optional(z.string().min(32)),
    // E-mails (src/lib/email): SMTP via nodemailer. Sem SMTP_HOST e SMTP_FROM, em
    // desenvolvimento os e-mails só aparecem no terminal e, em produção, o envio
    // (acesso de usuário novo, links de nova senha) fica desligado.
    SMTP_HOST: optional(z.string()),
    SMTP_PORT: optional(z.coerce.number().int().min(1).max(65535)),
    // "true" = TLS direto (porta 465); sem ela, vale TLS só na 465 (as outras usam STARTTLS).
    SMTP_SECURE: optional(z.enum(["true", "false"])),
    SMTP_USER: optional(z.string()),
    SMTP_PASSWORD: optional(z.string()),
    // Remetente: "Workboard <workboard@doubleone.com.br>".
    SMTP_FROM: optional(z.string()),
    // Só em desenvolvimento: a saudação do header finge que hoje é esta data
    // (AAAA-MM-DD), para conferir as datas especiais. Em produção é ignorada.
    GREETING_PREVIEW_DATE: optional(z.iso.date()),
    // Cofre de senhas dos clientes: 32 bytes em base64 (openssl rand -base64 32).
    // Sem ela, o cofre fica desligado. Trocar a chave torna as senhas salvas ilegíveis.
    VAULT_ENCRYPTION_KEY: optional(
      z
        .string()
        .refine(
          (value) => Buffer.from(value, "base64").length === 32,
          "VAULT_ENCRYPTION_KEY precisa ter 32 bytes em base64 (gere com: openssl rand -base64 32).",
        ),
    ),
  })
  .refine((env) => Boolean(env.MEDIA_CDN_URL) === Boolean(env.MEDIA_SIGNING_SECRET), {
    message: "Defina MEDIA_CDN_URL e MEDIA_SIGNING_SECRET juntas (ou nenhuma das duas).",
    path: ["MEDIA_SIGNING_SECRET"],
  })
  .refine((env) => Boolean(env.REALTIME_URL) === Boolean(env.REALTIME_SECRET), {
    message: "Defina REALTIME_URL e REALTIME_SECRET juntas (ou nenhuma das duas).",
    path: ["REALTIME_SECRET"],
  })
  .refine((env) => Boolean(env.SMTP_HOST) === Boolean(env.SMTP_FROM), {
    message: "Defina SMTP_HOST e SMTP_FROM juntas (ou nenhuma das duas).",
    path: ["SMTP_FROM"],
  })
  .refine((env) => !env.SMTP_USER || Boolean(env.SMTP_PASSWORD), {
    message: "Com SMTP_USER, defina também SMTP_PASSWORD.",
    path: ["SMTP_PASSWORD"],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
