"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ChoiceChips } from "@/components/choice-chips";
import { ClientLogo } from "@/components/client-logo";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { prepareContentImage } from "@/lib/avatar-image";
import { uploadMedia } from "@/lib/media-upload";
import { SOCIAL_NETWORKS, SOCIAL_NETWORK_KEYS, type SocialNetwork } from "@/lib/planning";
import { createPlanning, updatePlanning } from "./actions";
import type { PlanningFormValues, PlanningPersonView } from "./types";

type FieldErrors = Record<string, string[] | undefined>;

const NETWORK_OPTIONS = SOCIAL_NETWORK_KEYS.map((value) => ({ value, label: SOCIAL_NETWORKS[value] }));

async function uploadOverviewImage(file: File) {
  const prepared = await prepareContentImage(file);
  const item = await uploadMedia(prepared, { folder: "clientes" });
  return item.url;
}

type PlanningFormProps = {
  initial: PlanningFormValues;
  /** Clientes que podem ganhar planejamento (só no cadastro). */
  clients: { id: string; name: string; logoUrl: string | null }[];
  people: PlanningPersonView[];
  /** Ao editar: o cliente, que não muda. */
  client?: { name: string; slug: string; logoUrl: string | null };
  uploadsEnabled: boolean;
};

export function PlanningForm({ initial, clients, people, client, uploadsEnabled }: PlanningFormProps) {
  const router = useRouter();
  const editing = Boolean(initial.planningId);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof PlanningFormValues>(key: K, value: PlanningFormValues[K]) {
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      networks: values.networks,
      // Vazio = sem meta; texto inválido vira NaN e o servidor recusa com a mensagem do campo.
      postsPerMonth: values.postsPerMonth.trim() ? Number(values.postsPerMonth) : null,
      overview: values.overview,
      memberIds: values.memberIds,
    };
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = editing
        ? await updatePlanning({ ...payload, planningId: initial.planningId! })
        : await createPlanning({ ...payload, clientId: values.clientId ?? "" });
      if (!result.ok) {
        setError(result.fieldErrors ? "Revise os campos destacados." : result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      router.push(`/planejamentos/${result.slug ?? client?.slug ?? ""}`);
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

      <Section title="Cliente e redes" description="Um planejamento por cliente, preenchido mês a mês. A primeira rede marcada é a padrão dos posts.">
        <Card>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!fieldErrors.clientId}>
                <FieldLabel htmlFor="planning-client">Cliente</FieldLabel>
                {client ? (
                  <span className="flex h-10 items-center gap-2 text-sm font-medium">
                    <ClientLogo name={client.name} logoUrl={client.logoUrl} className="size-6 text-[9px]" />
                    {client.name}
                  </span>
                ) : (
                  <SearchablePicker
                    id="planning-client"
                    options={clientOptions}
                    value={values.clientId}
                    onChange={(clientId) => set("clientId", clientId)}
                    placeholder="Escolha o cliente"
                    searchPlaceholder="Buscar cliente..."
                    emptyText="Nenhum cliente sem planejamento."
                    invalid={!!fieldErrors.clientId}
                    disabled={isPending}
                  />
                )}
                <FieldError>{fieldErrors.clientId?.[0]}</FieldError>
              </Field>
              <Field data-invalid={!!fieldErrors.networks}>
                <FieldLabel id="planning-networks-label">Redes atendidas</FieldLabel>
                <ChoiceChips
                  aria-labelledby="planning-networks-label"
                  options={NETWORK_OPTIONS}
                  value={values.networks}
                  onChange={(networks) => set("networks", networks as SocialNetwork[])}
                  disabled={isPending}
                />
                <FieldError>{fieldErrors.networks?.[0]}</FieldError>
              </Field>
              <Field data-invalid={!!fieldErrors.postsPerMonth}>
                <FieldLabel htmlFor="planning-posts">Posts por mês</FieldLabel>
                <Input
                  id="planning-posts"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  value={values.postsPerMonth}
                  onChange={(event) => set("postsPerMonth", event.target.value)}
                  placeholder="Ex.: 8"
                  className="w-32"
                  aria-invalid={!!fieldErrors.postsPerMonth}
                  disabled={isPending}
                />
                <FieldDescription>A meta do contrato, para comparar com o que foi planejado em cada mês.</FieldDescription>
                <FieldError>{fieldErrors.postsPerMonth?.[0]}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </Section>

      <Section title="Responsáveis" description="Quem recebe aviso quando um mês ou post muda de status. Toda a equipe vê e edita os planejamentos.">
        <Card>
          <CardContent>
            <Field data-invalid={!!fieldErrors.memberIds}>
              <FieldLabel htmlFor="planning-members">Responsáveis</FieldLabel>
              <SearchablePicker
                id="planning-members"
                multiple
                options={personOptions}
                value={values.memberIds}
                onChange={(memberIds) => set("memberIds", memberIds)}
                placeholder="Ex.: social media e designer"
                searchPlaceholder="Buscar pessoa..."
                emptyText="Ninguém encontrado."
                invalid={!!fieldErrors.memberIds}
                disabled={isPending}
              />
              <FieldError>{fieldErrors.memberIds?.[0]}</FieldError>
            </Field>
          </CardContent>
        </Card>
      </Section>

      <Section title="Informações gerais" description="Objetivo, tom de voz, público, pilares de conteúdo, observações. Vale para todos os meses.">
        <Field data-invalid={!!fieldErrors.overview}>
          <FieldLabel id="planning-overview-label" className="sr-only">
            Informações gerais
          </FieldLabel>
          <RichTextEditor
            aria-labelledby="planning-overview-label"
            value={values.overview}
            onChange={(overview) => set("overview", overview)}
            placeholder="Ex.: objetivo das redes, tom de voz, público, pilares de conteúdo, o que evitar..."
            invalid={!!fieldErrors.overview}
            disabled={isPending}
            onUploadImage={uploadsEnabled ? uploadOverviewImage : undefined}
          />
          <FieldError>{fieldErrors.overview?.[0]}</FieldError>
        </Field>
      </Section>

      <div className="flex justify-end gap-2 border-t pt-6">
        <Link
          href={client ? `/planejamentos/${client.slug}` : "/planejamentos"}
          className={buttonVariants({ variant: "outline" })}
          aria-disabled={isPending}
        >
          Cancelar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin" />}
          {editing ? "Salvar alterações" : "Criar planejamento"}
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
