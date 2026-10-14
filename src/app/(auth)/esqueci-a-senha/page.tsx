import { MailXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { buttonVariants } from "@/components/ui/button";
import { isEmailConfigured } from "@/lib/email";
import { AuthHeading } from "../auth-heading";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Esqueceu a senha?",
};

// "Esqueceu a senha?" do login: a pessoa pede o link de nova senha
// (POST /api/auth/request-password-reset); o e-mail leva a /redefinir-senha.
// Sem envio de e-mail configurado, só orienta a falar com um administrador.
export default function EsqueciASenhaPage() {
  if (!isEmailConfigured()) {
    return (
      <div className="flex flex-col gap-7">
        <AuthHeading
          icon={<MailXIcon className="size-7 text-muted-foreground" />}
          title="Esqueceu a senha?"
          description="O envio de e-mails não está ligado. Peça um novo link a um administrador."
        />
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Voltar para o login
        </Link>
      </div>
    );
  }
  return (
    <ResetOnNavigation>
      <ForgotPasswordForm />
    </ResetOnNavigation>
  );
}
