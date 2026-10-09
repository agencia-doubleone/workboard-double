"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { z } from "zod";

import { PasswordField } from "@/components/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { signInSchema, type SignInInput } from "@/lib/validations/auth";
import { AuthHeading } from "../auth-heading";

type FieldErrors = Partial<Record<keyof SignInInput, string[]>>;

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const { error } = await authClient.signIn.email(parsed.data);
      if (error) {
        setFormError(getSignInErrorMessage(error));
        return;
      }

      router.replace(getCallbackUrl());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <AuthHeading
        title="Entrar no Workboard"
        description="Use o e-mail e a senha fornecidos pelo administrador."
      />
      {/* method="post" evita que um submit antes da hidratação vaze a senha na URL */}
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
          <Field data-invalid={!!fieldErrors.password}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <PasswordField
              id="password"
              name="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              invalid={!!fieldErrors.password}
              disabled={isPending}
            />
            <FieldError>{fieldErrors.password?.[0]}</FieldError>
          </Field>
          <Button type="submit" disabled={isPending} className="mt-1">
            {isPending && <Loader2Icon className="animate-spin" />}
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Esqueceu a senha? Peça um novo link a um administrador.
      </p>
    </div>
  );
}

function getSignInErrorMessage(error: { code?: string; status: number }) {
  if (error.status === 429) {
    return "Muitas tentativas. Aguarde alguns segundos e tente novamente.";
  }
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou senha incorretos.";
    case "BANNED_USER":
      return "Sua conta está desativada. Fale com um administrador.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}

// Só aceita destinos na mesma origem, para não virar um open redirect.
function getCallbackUrl() {
  const callbackUrl = new URLSearchParams(window.location.search).get(
    "callbackUrl",
  );
  if (!callbackUrl) return "/";

  const url = new URL(callbackUrl, window.location.origin);
  if (url.origin !== window.location.origin) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
