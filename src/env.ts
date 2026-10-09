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
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
