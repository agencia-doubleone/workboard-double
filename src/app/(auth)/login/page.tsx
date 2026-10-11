import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { isEmailConfigured } from "@/lib/email";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <>
      <Suspense>
        <RedirectIfAuthenticated />
      </Suspense>
      <LoginForm canResetPassword={isEmailConfigured()} />
    </>
  );
}

// Quem já está logado não precisa ver o formulário.
async function RedirectIfAuthenticated() {
  const session = await getSession();
  if (session) redirect("/");
  return null;
}
