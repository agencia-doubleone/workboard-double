import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PORTAL_HOME_PATH } from "@/lib/portal";
import { getPortalSession } from "@/lib/portal-session";
import { PortalSignInForm } from "./portal-sign-in-form";

export const metadata: Metadata = {
  title: "Portal do cliente",
};

// Entrada do portal do cliente, na mesma moldura do login da equipe.
export default function PortalEntrarPage() {
  return (
    <>
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <ResetOnNavigation>
        <PortalSignInForm />
      </ResetOnNavigation>
    </>
  );
}

// Quem já está no portal não precisa ver o formulário.
async function RedirectIfSignedIn() {
  if (await getPortalSession()) redirect(PORTAL_HOME_PATH);
  return null;
}
