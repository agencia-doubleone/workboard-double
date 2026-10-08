"use client";

import { AlertCircleIcon, CircleCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { z } from "zod";

import { PasswordField } from "@/components/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/users";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";

type FieldErrors = Partial<Record<keyof ResetPasswordInput, string[]>>;

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const { error } = await authClient.resetPassword({
        newPassword: parsed.data.password,
        token,
      });
      if (error) {
        setFormError(
          error.code === "INVALID_TOKEN"
            ? "Este link já foi usado ou expirou. Peça um novo a um administrador."
            : "Não foi possível redefinir a senha. Tente novamente.",
        );
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleCheckIcon className="size-4 text-success" />
            Senha redefinida
          </CardTitle>
          <CardDescription>
            Por segurança, todas as sessões abertas foram encerradas. Entre com
            a nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants({ className: "w-full" })}>
            Ir para o login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Criar nova senha</CardTitle>
        <CardDescription>Use pelo menos {PASSWORD_MIN_LENGTH} caracteres.</CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            {formError && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={!!fieldErrors.password}>
              <FieldLabel htmlFor="password">Nova senha</FieldLabel>
              <PasswordField
                id="password"
                value={password}
                onChange={setPassword}
                invalid={!!fieldErrors.password}
                disabled={isPending}
              />
              <FieldError>{fieldErrors.password?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.confirmPassword}>
              <FieldLabel htmlFor="confirm-password">Confirmar senha</FieldLabel>
              <PasswordField
                id="confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                invalid={!!fieldErrors.confirmPassword}
                disabled={isPending}
              />
              <FieldError>{fieldErrors.confirmPassword?.[0]}</FieldError>
            </Field>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              Salvar nova senha
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
