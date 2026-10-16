import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { auth } from "@/lib/auth";

/**
 * Lê a sessão atual (deduplicada por request).
 * Como depende dos headers, quem chamar precisa estar dentro de um <Suspense>.
 * O connection() para aqui o prefetch do App Shell (partialPrefetching): ele lê
 * os headers, mas corta a consulta ao banco no meio, e o Better Auth registrava
 * isso como INTERNAL_SERVER_ERROR em toda rota.
 */
export const getSession = cache(async () => {
  await connection();
  return auth.api.getSession({ headers: await headers() });
});

/** Garante um usuário autenticado ou redireciona para o login. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Para Server Actions: a sessão do admin, ou null (sem redirecionar). */
export async function getAdminSession() {
  const session = await getSession();
  return session?.user.role === "admin" ? session : null;
}

/** Garante um admin; para os demais a rota simplesmente não existe. */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") notFound();
  return session;
}
