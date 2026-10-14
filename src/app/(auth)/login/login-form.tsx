"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";

import { PasswordField } from "@/components/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { signInSchema, type SignInInput } from "@/lib/validations/auth";
import { AuthHeading } from "../auth-heading";

type FieldErrors = Partial<Record<keyof SignInInput, string[]>>;

/** `canResetPassword`: com envio de e-mail, "Esqueceu a senha?" leva à tela de pedir o link. */
export function LoginForm({ canResetPassword }: { canResetPassword: boolean }) {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Quem entrou com "Lembrar de mim" encontra o e-mail preenchido e já digita a senha.
  useEffect(() => {
    const input = emailRef.current;
    const saved = readRememberedEmail();
    if (!input || input.value || !saved) return;
    input.value = saved;
    document.getElementById("password")?.focus();
  }, []);

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
      // Sem "Lembrar de mim", o Better Auth faz a sessão acabar ao fechar o navegador (e em até 1 dia).
      const { error } = await authClient.signIn.email({ ...parsed.data, rememberMe });
      if (error) {
        setFormError(getSignInErrorMessage(error));
        return;
      }

      saveRememberedEmail(rememberMe ? parsed.data.email : null);
      if (rememberMe) offerToSavePassword(parsed.data);

      // A tela de login fica guardada escondida (cacheComponents): a senha não pode ficar no estado dela.
      setPassword("");
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
              autoComplete="username"
              placeholder="voce@doubleone.com.br"
              aria-invalid={!!fieldErrors.email}
              disabled={isPending}
              ref={emailRef}
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
          <Field orientation="horizontal">
            <Checkbox
              id="remember-me"
              checked={rememberMe}
              onCheckedChange={setRememberMe}
              disabled={isPending}
            />
            <FieldLabel htmlFor="remember-me" className="font-normal">
              Lembrar de mim
            </FieldLabel>
          </Field>
          <Button type="submit" disabled={isPending} className="mt-1">
            {isPending && <Loader2Icon className="animate-spin" />}
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
        </FieldGroup>
      </form>
      {canResetPassword ? (
        <Link
          href="/esqueci-a-senha"
          className="self-center text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          Esqueceu a senha?
        </Link>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Esqueceu a senha? Peça um novo link a um administrador.
        </p>
      )}
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

const REMEMBERED_EMAIL_KEY = "wb:login-email";

function readRememberedEmail() {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY);
  } catch {
    return null;
  }
}

// Só o e-mail fica no aparelho. A senha nunca vai para o localStorage: quem guarda é
// o gerenciador de senhas do navegador (offerToSavePassword).
function saveRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Armazenamento bloqueado: só não lembra o e-mail.
  }
}

type PasswordCredentialConstructor = new (data: { id: string; password: string }) => Credential;

/**
 * Pede ao gerenciador de senhas do navegador para guardar o acesso. Chrome e Edge
 * mostram o "Salvar senha?" (ou atualizam a senha salva); nos outros navegadores a
 * API não existe e eles oferecem sozinhos.
 */
function offerToSavePassword({ email, password }: SignInInput) {
  const { PasswordCredential } = window as typeof window & {
    PasswordCredential?: PasswordCredentialConstructor;
  };
  if (!PasswordCredential || !navigator.credentials) return;
  navigator.credentials.store(new PasswordCredential({ id: email, password })).catch(() => {});
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
