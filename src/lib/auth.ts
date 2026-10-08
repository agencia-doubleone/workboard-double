import { db } from "@/db";
import { env } from "@/env";
import { createAuth } from "./auth-config";

// Sem "server-only" aqui: o script de seed também importa este módulo.
// Para ler a sessão em componentes, use "@/lib/session".
export const auth = createAuth({
  database: db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
