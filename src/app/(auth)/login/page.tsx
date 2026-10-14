import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
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
      <ResetOnNavigation>
        <LoginForm canResetPassword={isEmailConfigured()} />
      </ResetOnNavigation>
    </>
  );
}

// Quem já está logado não precisa ver o formulário.
async function RedirectIfAuthenticated() {
  const session = await getSession();
  if (session) redirect("/");
  return null;
}
