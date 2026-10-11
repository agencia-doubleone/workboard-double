"use client";

import { AlertCircleIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RESET_EXPIRES_IN_HOURS } from "@/lib/users";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { AuthHeading } from "../auth-heading";

type FieldErrors = Partial<Record<keyof ForgotPasswordInput, string[]>>;

/**
 * Pede o link de nova senha por e-mail. A resposta é a mesma com ou sem conta
 * (o servidor não conta quais e-mails existem), então a tela de "enviado" também.
 */
export function ForgotPasswordForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const { error } = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: "/redefinir-senha",
      });
      if (error) {
        setFormError(
          error.status === 429
            ? "Muitos pedidos seguidos. Aguarde um minuto e tente de novo."
            : "Não foi possível enviar o link. Tente novamente.",
        );
        return;
      }
      setSentTo(parsed.data.email);
    });
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-7">
        <AuthHeading
          icon={<MailCheckIcon className="size-7 text-success" />}
          title="Confira seu e-mail"
          description={
            <>
              Se houver uma conta com <span className="font-medium text-foreground">{sentTo}</span>, enviamos um
              link para criar uma nova senha. Ele vale por {PASSWORD_RESET_EXPIRES_IN_HOURS} horas. Não chegou? Veja
              o spam ou fale com um administrador.
            </>
          }
        />
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <AuthHeading
        title="Esqueceu a senha?"
        description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
      />
      <form method="post" onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          {formError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={!!fieldErrors.email}>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@doubleone.com.br"
              aria-invalid={!!fieldErrors.email}
              disabled={isPending}
              autoFocus
            />
            <FieldError>{fieldErrors.email?.[0]}</FieldError>
          </Field>
          <Button type="submit" disabled={isPending} className="mt-1">
            {isPending && <Loader2Icon className="animate-spin" />}
            {isPending ? "Enviando..." : "Enviar link"}
          </Button>
        </FieldGroup>
      </form>
      <Link
        href="/login"
        className="self-center text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
      >
        Voltar para o login
      </Link>
    </div>
  );
}
