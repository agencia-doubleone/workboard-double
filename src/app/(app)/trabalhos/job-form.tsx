"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ClientLogo } from "@/components/client-logo";
import { DatePicker } from "@/components/date-picker";
import { JobStatusBadge } from "@/components/job-status-badge";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/user-avatar";
import { prepareContentImage } from "@/lib/avatar-image";
import { uploadMedia } from "@/lib/media-upload";
import { createJobSchema } from "@/lib/validations/jobs";
import { createJob, updateJob } from "./actions";
import type { ClientOption, JobFormValues, JobPersonView, JobStatusOption } from "./types";

type FieldErrors = Record<string, string[] | undefined>;

const SECTIONS = {
  job: { title: "Trabalho", description: "O que é, para quem, quem faz e até quando." },
  briefing: { title: "Briefing", description: "Tudo o que a equipe precisa para fazer o trabalho. Dá para colar imagens." },
};

/** Imagem colada ou enviada no briefing: sobe na hora para o CDN. */
async function uploadBriefingImage(file: File) {
  const prepared = await prepareContentImage(file);
  const item = await uploadMedia(prepared, { folder: "trabalhos" });
  return item.url;
}

type JobFormProps = {
  initial: JobFormValues;
  statuses: JobStatusOption[];
  clients: ClientOption[];
  people: JobPersonView[];
  uploadsEnabled: boolean;
};

export function JobForm({ initial, statuses, clients, people, uploadsEnabled }: JobFormProps) {
  const router = useRouter();
  const editing = Boolean(initial.jobId);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const clientOptions: PickerOption[] = clients.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <ClientLogo name={item.name} logoUrl={item.logoUrl} className="size-5 text-[9px]" />,
  }));
  const personOptions: PickerOption[] = people.map((person) => ({
    value: person.id,
    label: person.name,
    icon: <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-5 text-[9px]" />,
  }));
  const statusItems = Object.fromEntries(statuses.map((status) => [status.id, status.name]));
  const selectedStatus = statuses.find((status) => status.id === values.statusId);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: values.name,
      clientId: values.clientId ?? "",
      assigneeIds: values.assigneeIds,
      dueDate: values.dueDate,
      statusId: values.statusId,
      active: values.active,
      briefing: values.briefing,
    };
    const parsed = createJobSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Revise os campos destacados.");
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = editing
        ? await updateJob({ ...payload, jobId: initial.jobId! })
        : await createJob(payload);
      if (!result.ok) {
        setError(result.fieldErrors ? "Revise os campos destacados." : result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      router.push(`/trabalhos/${result.pit ?? initial.pit}`);
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

      <Section {...SECTIONS.job}>
        <Card>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!fieldErrors.name}>
                <FieldLabel htmlFor="job-name">Nome</FieldLabel>
                <Input
                  id="job-name"
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Ex.: Post Dia das Crianças"
                  aria-invalid={!!fieldErrors.name}
                  disabled={isPending}
                  autoFocus={!editing}
                  autoComplete="off"
                />
                <FieldError>{fieldErrors.name?.[0]}</FieldError>
              </Field>

              <div className="grid items-start gap-5 md:grid-cols-2">
                <Field data-invalid={!!fieldErrors.clientId}>
                  <FieldLabel htmlFor="job-client">Cliente</FieldLabel>
                  <SearchablePicker
                    id="job-client"
                    options={clientOptions}
                    value={values.clientId}
                    onChange={(clientId) => set("clientId", clientId)}
                    placeholder="Escolha o cliente"
                    searchPlaceholder="Buscar cliente..."
                    emptyText="Nenhum cliente encontrado."
                    invalid={!!fieldErrors.clientId}
                    disabled={isPending}
                  />
                  <FieldError>{fieldErrors.clientId?.[0]}</FieldError>
                </Field>
                <Field data-invalid={!!fieldErrors.dueDate}>
                  <FieldLabel htmlFor="job-due">Entrega</FieldLabel>
                  <DatePicker
                    id="job-due"
                    value={values.dueDate}
                    onChange={(dueDate) => set("dueDate", dueDate)}
                    invalid={!!fieldErrors.dueDate}
                    disabled={isPending}
                    fromYear={2000}
                    toYear={new Date().getFullYear() + 5}
                  />
                  {fieldErrors.dueDate ? (
                    <FieldError>{fieldErrors.dueDate[0]}</FieldError>
                  ) : (
                    <FieldDescription>Opcional. Passou da data sem encerrar, aparece em vermelho.</FieldDescription>
                  )}
                </Field>
              </div>

              <Field data-invalid={!!fieldErrors.assigneeIds}>
                <FieldLabel htmlFor="job-assignees">Funcionários</FieldLabel>
                <SearchablePicker
                  id="job-assignees"
                  multiple
                  options={personOptions}
                  value={values.assigneeIds}
                  onChange={(assigneeIds) => set("assigneeIds", assigneeIds)}
                  placeholder="Quem vai trabalhar nisso"
                  searchPlaceholder="Buscar pessoa..."
                  emptyText="Ninguém encontrado."
                  invalid={!!fieldErrors.assigneeIds}
                  disabled={isPending}
                />
                <FieldError>{fieldErrors.assigneeIds?.[0]}</FieldError>
              </Field>

              <div className="grid items-start gap-5 md:grid-cols-2">
                <Field data-invalid={!!fieldErrors.statusId}>
                  <FieldLabel htmlFor="job-status">Status</FieldLabel>
                  <Select
                    items={statusItems}
                    value={values.statusId}
                    onValueChange={(statusId) => statusId && set("statusId", statusId)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="job-status" className="w-full" aria-invalid={!!fieldErrors.statusId}>
                      <SelectValue>
                        {selectedStatus && (
                          <JobStatusBadge
                            name={selectedStatus.name}
                            textColor={selectedStatus.textColor}
                            backgroundColor={selectedStatus.backgroundColor}
                          />
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} align="start">
                      {statuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          <JobStatusBadge name={status.name} textColor={status.textColor} backgroundColor={status.backgroundColor} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldErrors.statusId?.[0]}</FieldError>
                </Field>
                <Field orientation="horizontal" className="md:pt-8">
                  <Switch
                    id="job-active"
                    checked={values.active}
                    onCheckedChange={(active) => set("active", active)}
                    disabled={isPending}
                  />
                  <div className="grid gap-0.5">
                    <FieldLabel htmlFor="job-active">Ativo</FieldLabel>
                    <FieldDescription>Desligado, sai da lista “Em aberto” sem mudar o status.</FieldDescription>
                  </div>
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </Section>

      <Section {...SECTIONS.briefing}>
        <Field data-invalid={!!fieldErrors.briefing}>
          <FieldLabel id="job-briefing-label" className="sr-only">
            Briefing
          </FieldLabel>
          <RichTextEditor
            aria-labelledby="job-briefing-label"
            value={values.briefing}
            onChange={(briefing) => set("briefing", briefing)}
            placeholder="Ex.: objetivo, formato e medidas, textos, referências, prazos de aprovação..."
            invalid={!!fieldErrors.briefing}
            disabled={isPending}
            onUploadImage={uploadsEnabled ? uploadBriefingImage : undefined}
          />
          <FieldError>{fieldErrors.briefing?.[0]}</FieldError>
        </Field>
      </Section>

      <div className="flex justify-end gap-2 border-t pt-6">
        <Link
          href={editing ? `/trabalhos/${initial.pit}` : "/trabalhos"}
          className={buttonVariants({ variant: "outline" })}
          aria-disabled={isPending}
        >
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          {editing ? "Salvar alterações" : "Cadastrar trabalho"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-12 2xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
