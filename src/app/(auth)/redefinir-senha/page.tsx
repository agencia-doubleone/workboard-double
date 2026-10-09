import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthHeading } from "../auth-heading";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
};

// O e-mail aponta para /api/auth/reset-password/<token>; o Better Auth valida
// o token e redireciona para cá com ?token=... ou ?error=INVALID_TOKEN.
export default function RedefinirSenhaPage({ searchParams }: PageProps<"/redefinir-senha">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
      <ResetPasswordContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetPasswordContent({
  searchParams,
}: {
  searchParams: PageProps<"/redefinir-senha">["searchParams"];
}) {
  const { token, error } = await searchParams;
  if (typeof token !== "string" || !token || error) return <InvalidLink />;
  return <ResetPasswordForm token={token} />;
}

function InvalidLink() {
  return (
    <div className="flex flex-col gap-7">
      <AuthHeading
        icon={<LinkIcon className="size-7 text-muted-foreground" />}
        title="Link inválido ou expirado"
        description="Este link de redefinição já foi usado ou passou da validade. Peça um novo link a um administrador."
      />
      <Link href="/login" className={buttonVariants({ variant: "outline" })}>
        Ir para o login
      </Link>
    </div>
  );
}
