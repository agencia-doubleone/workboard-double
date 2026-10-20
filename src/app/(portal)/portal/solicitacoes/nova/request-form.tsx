"use client";

import { AlertCircleIcon, Loader2Icon, SendHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ProfileSection } from "@/components/profile/profile-section";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { prepareContentImage } from "@/lib/avatar-image";
import { REQUEST_TITLE_MAX_LENGTH } from "@/lib/client-requests";
import { uploadMedia } from "@/lib/media-upload";
import { PORTAL_REQUESTS_PATH } from "@/lib/portal";
import { createClientRequestSchema } from "@/lib/validations/client-requests";
import { createPortalRequest } from "../actions";

type FieldErrors = Record<string, string[] | undefined>;

/** Imagem colada ou escolhida no briefing: sobe na hora para o CDN (pasta das solicitações). */
async function uploadBriefingImage(file: File) {
  const prepared = await prepareContentImage(file);
  const item = await uploadMedia(prepared, { folder: "solicitacoes", via: "portal" });
  return item.url;
}

/** O editor devolve HTML: vazio é sem texto e sem imagem. */
function isBlank(html: string) {
  return !html.includes("<img") && html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

export function RequestForm({ uploadsEnabled }: { uploadsEnabled: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [briefing, setBriefing] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = createClientRequestSchema.safeParse({ title, briefing });
    const errors: FieldErrors = parsed.success ? {} : (z.flattenError(parsed.error).fieldErrors as FieldErrors);
    if (isBlank(briefing)) errors.briefing = ["Escreva o briefing: o que você precisa."];
    if (!parsed.success || errors.briefing) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    startTransition(async () => {
      const result = await createPortalRequest(parsed.data).catch(() => null);
      if (!result?.ok) {
        setError(result && !result.fieldErrors ? result.error : result ? null : "Não foi possível enviar. Tente de novo.");
        setFieldErrors(result?.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      router.push(result.number ? `${PORTAL_REQUESTS_PATH}/${result.number}` : PORTAL_REQUESTS_PATH);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ProfileSection title="Assunto" description="Em poucas palavras, o que você precisa. Vira o título da solicitação.">
        <Card>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!fieldErrors.title}>
                <FieldLabel htmlFor="request-title">Assunto</FieldLabel>
                <Input
                  id="request-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={REQUEST_TITLE_MAX_LENGTH}
                  placeholder="Ex.: Arte para a promoção de dezembro"
                  aria-invalid={!!fieldErrors.title}
                  disabled={isPending}
                  autoFocus
                />
                <FieldError>{fieldErrors.title?.[0]}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </ProfileSection>

      <ProfileSection
        title="Briefing"
        description="Conte os detalhes: objetivo, onde vai ser usado, textos, referências e prazos. Dá para colar imagens."
      >
        <Field data-invalid={!!fieldErrors.briefing}>
          <FieldLabel id="request-briefing-label" className="sr-only">
            Briefing
          </FieldLabel>
          <RichTextEditor
            aria-labelledby="request-briefing-label"
            value={briefing}
            onChange={setBriefing}
            placeholder="Ex.: objetivo, formato e medidas, textos, referências, quando precisa..."
            invalid={!!fieldErrors.briefing}
            disabled={isPending}
            onUploadImage={uploadsEnabled ? uploadBriefingImage : undefined}
          />
          {fieldErrors.briefing ? (
            <FieldError>{fieldErrors.briefing[0]}</FieldError>
          ) : (
            <FieldDescription>Depois de enviar, continue a conversa com a equipe na página da solicitação.</FieldDescription>
          )}
        </Field>
      </ProfileSection>

      <div className="flex justify-end gap-2 border-t pt-6">
        <Link href={PORTAL_REQUESTS_PATH} className={buttonVariants({ variant: "outline" })} aria-disabled={isPending}>
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon data-icon="inline-start" />}
          Enviar solicitação
        </Button>
      </div>
    </form>
  );
}
