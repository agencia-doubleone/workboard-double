"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { celebrate } from "@/components/celebration";
import { ClientLogo } from "@/components/client-logo";
import { DatePicker } from "@/components/date-picker";
import { ProfileSection } from "@/components/profile/profile-section";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { prepareContentImage } from "@/lib/avatar-image";
import {
  isRequestCompletion,
  isRequestStatus,
  REQUEST_STATUSES,
  REQUEST_STATUS_KEYS,
  REQUEST_TITLE_MAX_LENGTH,
  type RequestStatus,
} from "@/lib/client-requests";
import { uploadMedia } from "@/lib/media-upload";
import { teamRequestSchema } from "@/lib/validations/client-requests";
import { createRequest, updateRequest } from "./actions";

type FieldErrors = Record<string, string[] | undefined>;

export type RequestFormValues = {
  /** Preenchidos ao editar. */
  requestId?: string;
  number?: number;
  clientId: string | null;
  title: string;
  briefing: string;
  status: RequestStatus;
  /** "AAAA-MM-DD" ou "" (sem previsão). */
  expectedOn: string;
};

export type RequestClientOption = { id: string; name: string; logoUrl: string | null };

const STATUS_ITEMS = Object.fromEntries(REQUEST_STATUS_KEYS.map((status) => [status, REQUEST_STATUSES[status].label]));

/** Imagem colada ou escolhida no briefing: sobe na hora para o CDN (pasta das solicitações). */
async function uploadBriefingImage(file: File) {
  const prepared = await prepareContentImage(file);
  const item = await uploadMedia(prepared, { folder: "solicitacoes" });
  return item.url;
}

/**
 * Cadastro (em nome do cliente) e edição de uma solicitação pela equipe. O
 * cliente vê tudo isso no portal; o que muda entra no andamento dele.
 */
export function RequestForm({
  initial,
  clients,
  clientLocked = false,
  uploadsEnabled,
}: {
  initial: RequestFormValues;
  clients: RequestClientOption[];
  /** O cliente já participou (abriu pelo portal ou escreveu): a solicitação não muda de cliente. */
  clientLocked?: boolean;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial.requestId);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof RequestFormValues>(key: K, value: RequestFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const clientOptions: PickerOption[] = clients.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <ClientLogo name={item.name} logoUrl={item.logoUrl} className="size-5 text-[9px]" />,
  }));
  const backHref = editing ? `/solicitacoes/${initial.number}` : "/solicitacoes";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      clientId: values.clientId ?? "",
      title: values.title,
      briefing: values.briefing,
      status: values.status,
      expectedOn: values.expectedOn,
    };
    const parsed = teamRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Revise os campos destacados.");
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await (editing ? updateRequest({ ...payload, requestId: initial.requestId! }) : createRequest(payload)).catch(
        () => null,
      );
      if (!result?.ok) {
        setError(result ? result.error : "Não foi possível salvar. Tente de novo.");
        setFieldErrors(result?.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      // Editou e passou para "Finalizada": comemora, como nos trabalhos.
      if (editing && isRequestCompletion(initial.status, values.status)) celebrate();
      router.push(result.number ? `/solicitacoes/${result.number}` : backHref);
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

      <ProfileSection
        title="Solicitação"
        description="Para qual cliente, o assunto e como está. O cliente vê tudo isso no portal."
      >
        <Card>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!fieldErrors.clientId}>
                <FieldLabel htmlFor="request-client">Cliente</FieldLabel>
                <SearchablePicker
                  id="request-client"
                  options={clientOptions}
                  value={values.clientId}
                  onChange={(clientId) => set("clientId", clientId)}
                  placeholder="Escolha o cliente"
                  searchPlaceholder="Buscar cliente..."
                  emptyText="Nenhum cliente encontrado."
                  invalid={!!fieldErrors.clientId}
                  disabled={isPending || clientLocked}
                />
                {fieldErrors.clientId ? (
                  <FieldError>{fieldErrors.clientId[0]}</FieldError>
                ) : (
                  <FieldDescription>
                    {clientLocked
                      ? "O cliente já participou desta solicitação: ela não muda mais de cliente."
                      : "A solicitação aparece no portal desse cliente, para todos os contatos dele."}
                  </FieldDescription>
                )}
              </Field>

              <Field data-invalid={!!fieldErrors.title}>
                <FieldLabel htmlFor="request-title">Assunto</FieldLabel>
                <Input
                  id="request-title"
                  value={values.title}
                  onChange={(event) => set("title", event.target.value)}
                  maxLength={REQUEST_TITLE_MAX_LENGTH}
                  placeholder="Ex.: Arte para a promoção de dezembro"
                  aria-invalid={!!fieldErrors.title}
                  disabled={isPending}
                  autoFocus={!editing}
                  autoComplete="off"
                />
                <FieldError>{fieldErrors.title?.[0]}</FieldError>
              </Field>

              <div className="grid items-start gap-5 md:grid-cols-2">
                <Field data-invalid={!!fieldErrors.status}>
                  <FieldLabel htmlFor="request-status">Status</FieldLabel>
                  <Select
                    items={STATUS_ITEMS}
                    value={values.status}
                    onValueChange={(status) => isRequestStatus(status) && set("status", status)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="request-status" className="w-full" aria-invalid={!!fieldErrors.status}>
                      <SelectValue>
                        <RequestStatusBadge status={values.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} align="start">
                      {REQUEST_STATUS_KEYS.map((status) => (
                        <SelectItem key={status} value={status}>
                          <RequestStatusBadge status={status} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldErrors.status?.[0]}</FieldError>
                </Field>
                <Field data-invalid={!!fieldErrors.expectedOn}>
                  <FieldLabel htmlFor="request-expected-on">Previsão de entrega</FieldLabel>
                  <DatePicker
                    id="request-expected-on"
                    value={values.expectedOn}
                    onChange={(expectedOn) => set("expectedOn", expectedOn)}
                    invalid={!!fieldErrors.expectedOn}
                    disabled={isPending}
                    fromYear={2000}
                    toYear={new Date().getFullYear() + 5}
                  />
                  {fieldErrors.expectedOn ? (
                    <FieldError>{fieldErrors.expectedOn[0]}</FieldError>
                  ) : (
                    <FieldDescription>Opcional. Passou da data sem encerrar, aparece em vermelho.</FieldDescription>
                  )}
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </ProfileSection>

      <ProfileSection
        title="Briefing"
        description="O que o cliente pediu, com os detalhes. Opcional; dá para colar imagens."
      >
        <Field data-invalid={!!fieldErrors.briefing}>
          <FieldLabel id="request-briefing-label" className="sr-only">
            Briefing
          </FieldLabel>
          <RichTextEditor
            aria-labelledby="request-briefing-label"
            value={values.briefing}
            onChange={(briefing) => set("briefing", briefing)}
            placeholder="Ex.: objetivo, formato e medidas, textos, referências, quando precisa..."
            invalid={!!fieldErrors.briefing}
            disabled={isPending}
            onUploadImage={uploadsEnabled ? uploadBriefingImage : undefined}
          />
          <FieldError>{fieldErrors.briefing?.[0]}</FieldError>
        </Field>
      </ProfileSection>

      <div className="flex justify-end gap-2 border-t pt-6">
        <Link href={backHref} className={buttonVariants({ variant: "outline" })} aria-disabled={isPending}>
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          {editing ? "Salvar alterações" : "Cadastrar solicitação"}
        </Button>
      </div>
    </form>
  );
}
