"use client";

import { AlertCircleIcon, ArrowLeftIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PORTAL_CODE_EXPIRES_MINUTES, PORTAL_CODE_LENGTH, PORTAL_CODE_RESEND_SECONDS, PORTAL_HOME_PATH } from "@/lib/portal";
import { portalAuthClient } from "@/lib/portal-auth-client";
import { emailSchema } from "@/lib/validations/auth";
import { AuthHeading } from "../../auth-heading";

type Step = { kind: "email" } | { kind: "code"; email: string };

/**
 * Entrada do portal em duas etapas: o e-mail e depois o código que chega nele.
 * A resposta do pedido é a mesma tenha ou não acesso (não conta quais e-mails
 * estão cadastrados), então a tela sempre segue para o código.
 */
export function PortalSignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Contagem para poder pedir outro código.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function requestCode(target: string) {
    startTransition(async () => {
      const { error } = await portalAuthClient.emailOtp.sendVerificationOtp({ email: target, type: "sign-in" });
      if (error) {
        setFormError(
          error.status === 429
            ? "Muitos pedidos seguidos. Aguarde um minuto e tente de novo."
            : "Não foi possível enviar o código. Tente novamente.",
        );
        return;
      }
      setFormError(null);
      setCode("");
      setStep({ kind: "code", email: target });
      setResendIn(PORTAL_CODE_RESEND_SECONDS);
    });
  }

  function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setFieldError(z.flattenError(parsed.error).formErrors[0] ?? "Informe um e-mail válido.");
      return;
    }
    setFieldError(null);
    requestCode(parsed.data);
  }

  function handleCode(event: React.FormEvent) {
    event.preventDefault();
    if (step.kind !== "code") return;
    const otp = code.replace(/\D/g, "");
    if (otp.length !== PORTAL_CODE_LENGTH) {
      setFieldError(`Digite os ${PORTAL_CODE_LENGTH} números do código.`);
      return;
    }
    setFieldError(null);
    startTransition(async () => {
      const { error } = await portalAuthClient.signIn.emailOtp({ email: step.email, otp });
      if (error) {
        setFormError(signInErrorMessage(error));
        return;
      }
      // A tela fica guardada escondida (cacheComponents): o código não fica no estado dela.
      setCode("");
      router.replace(PORTAL_HOME_PATH);
      router.refresh();
    });
  }

  if (step.kind === "code") {
    return (
      <div className="flex flex-col gap-7">
        <AuthHeading
          icon={<MailCheckIcon className="size-7 text-success" />}
          title="Digite o código"
          description={
            <>
              Se <span className="font-medium text-foreground">{step.email}</span> tem acesso ao portal, enviamos um
              código de {PORTAL_CODE_LENGTH} números. Ele vale por {PORTAL_CODE_EXPIRES_MINUTES} minutos.
            </>
          }
        />
        <form method="post" onSubmit={handleCode} noValidate>
          <FieldGroup>
            {formError && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={!!fieldError}>
              <FieldLabel htmlFor="code">Código</FieldLabel>
              <Input
                id="code"
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, PORTAL_CODE_LENGTH))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={"0".repeat(PORTAL_CODE_LENGTH)}
                aria-invalid={!!fieldError}
                disabled={isPending}
                className="h-12 text-center font-mono text-xl tracking-[0.5em] md:text-xl"
                autoFocus
              />
              {fieldError ? (
                <FieldError>{fieldError}</FieldError>
              ) : (
                <FieldDescription className="text-center">Não chegou? Confira o spam.</FieldDescription>
              )}
            </Field>
            <Button type="submit" disabled={isPending} className="mt-1">
              {isPending && <Loader2Icon className="animate-spin" />}
              {isPending ? "Entrando..." : "Entrar"}
            </Button>
          </FieldGroup>
        </form>
        <div className="flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={() => {
              setStep({ kind: "email" });
              setFormError(null);
              setFieldError(null);
            }}
            className="flex items-center gap-1 text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
          >
            <ArrowLeftIcon className="size-3.5" />
            Usar outro e-mail
          </button>
          <button
            type="button"
            onClick={() => requestCode(step.email)}
            disabled={isPending || resendIn > 0}
            className="text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline disabled:pointer-events-none disabled:opacity-60"
          >
            {resendIn > 0 ? `Reenviar em ${resendIn}s` : "Reenviar código"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <AuthHeading
        title="Portal do cliente"
        description="Entre com o e-mail cadastrado pela Double One. Enviamos um código para você, sem senha."
      />
      <form method="post" onSubmit={handleEmail} noValidate>
        <FieldGroup>
          {formError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="voce@suaempresa.com.br"
              aria-invalid={!!fieldError}
              disabled={isPending}
              autoFocus
            />
            <FieldError>{fieldError}</FieldError>
          </Field>
          <Button type="submit" disabled={isPending} className="mt-1">
            {isPending && <Loader2Icon className="animate-spin" />}
            {isPending ? "Enviando..." : "Enviar código"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        É da equipe Double One?{" "}
        <Link href="/login" className="font-medium text-foreground outline-none hover:underline focus-visible:underline">
          Entrar no Workboard
        </Link>
      </p>
    </div>
  );
}

function signInErrorMessage(error: { code?: string; status: number }) {
  if (error.status === 429) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  switch (error.code) {
    case "OTP_EXPIRED":
      return "O código venceu. Peça um novo.";
    case "TOO_MANY_ATTEMPTS":
      return "Muitas tentativas erradas. Peça um novo código.";
    case "INVALID_OTP":
      return "Código incorreto. Confira e tente de novo.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}
