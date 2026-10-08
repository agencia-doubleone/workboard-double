import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
};

// O e-mail aponta para /api/auth/reset-password/<token>; o Better Auth valida
// o token e redireciona para cá com ?token=... ou ?error=INVALID_TOKEN.
export default function RedefinirSenhaPage({ searchParams }: PageProps<"/redefinir-senha">) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LinkIcon className="size-4 text-muted-foreground" />
          Link inválido ou expirado
        </CardTitle>
        <CardDescription>
          Este link de redefinição já foi usado ou passou da validade. Peça um
          novo link a um administrador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className={buttonVariants({ variant: "outline", className: "w-full" })}>
          Ir para o login
        </Link>
      </CardContent>
    </Card>
  );
}
