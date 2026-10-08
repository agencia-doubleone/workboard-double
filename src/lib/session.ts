import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

/**
 * Lê a sessão atual (deduplicada por request).
 * Como depende dos headers, quem chamar precisa estar dentro de um <Suspense>.
 */
export const getSession = cache(async () => {
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
