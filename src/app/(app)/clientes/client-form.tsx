"use client";

import { AlertCircleIcon, ImageUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CLIENT_LINK_ICONS } from "@/components/brand-icons";
import { ChoiceChips } from "@/components/choice-chips";
import { ClientLogo } from "@/components/client-logo";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Slider } from "@/components/ui/slider";
import { AVATAR_ACCEPT, prepareContentImage, prepareLogo } from "@/lib/avatar-image";
import {
  AGE_MAX,
  AGE_MIN,
  CLIENT_LINK_KEYS,
  CLIENT_LINKS,
  formatAgeRange,
  GENDER_VALUES,
  GENDERS,
  SOCIAL_CLASSES,
  type ClientLink,
} from "@/lib/clients";
import { MediaUploadError, uploadMedia } from "@/lib/media-upload";
import { cn } from "@/lib/utils";
import { clientSchema } from "@/lib/validations/clients";
import { createClient, updateClient } from "./actions";
import type { ClientFormValues } from "./types";

type FieldErrors = Record<string, string[] | undefined>;

/** Logo: mantém o atual, troca por um arquivo novo (sobe só ao salvar) ou remove. */
type LogoState = { kind: "keep" } | { kind: "new"; file: File; preview: string } | { kind: "removed" };

const GENDER_OPTIONS = GENDER_VALUES.map((value) => ({ value, label: GENDERS[value] }));
const CLASS_OPTIONS = SOCIAL_CLASSES.map((value) => ({ value, label: value }));

const SECTIONS = {
  identity: { title: "Identificação", description: "Nome e logo como aparecem no Workboard. O logo é opcional." },
  links: { title: "Presença online", description: "Site e redes sociais. Sem o https://, o endereço é completado sozinho." },
  audience: { title: "Público-alvo", description: "Para quem o cliente fala. Sem nada marcado, vale todos." },
  notes: { title: "Informações gerais", description: "Briefing, tom de voz, contatos, cuidados, o que a equipe precisa saber." },
};

/** Imagem colada ou enviada nas informações gerais: sobe na hora para o CDN. */
async function uploadNotesImage(file: File) {
  const prepared = await prepareContentImage(file);
  const item = await uploadMedia(prepared, { folder: "clientes" });
  return item.url;
}

export function ClientForm({ initial, uploadsEnabled }: { initial: ClientFormValues; uploadsEnabled: boolean }) {
  const router = useRouter();
  const editing = Boolean(initial.clientId);
  const [values, setValues] = useState(initial);
  const [logo, setLogo] = useState<LogoState>({ kind: "keep" });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();
  const busy = isPending;

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: values.name,
      website: values.website,
      instagram: values.instagram,
      facebook: values.facebook,
      linkedin: values.linkedin,
      youtube: values.youtube,
      ageMin: values.ageMin,
      ageMax: values.ageMax,
      genders: values.genders,
      socialClasses: values.socialClasses,
      notes: values.notes,
    };
    // Valida antes de enviar o logo: não sobe arquivo para um formulário inválido.
    const parsed = clientSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Revise os campos destacados.");
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      try {
        let logoMediaId: string | null | undefined;
        if (logo.kind === "new") {
          setProgress(0);
          const item = await uploadMedia(logo.file, { folder: "clientes", onProgress: setProgress });
          logoMediaId = item.id;
        } else if (logo.kind === "removed") {
          logoMediaId = null;
        }
        const result = editing
          ? await updateClient({ ...payload, logoMediaId, clientId: initial.clientId! })
          : await createClient({ ...payload, logoMediaId });
        if (!result.ok) {
          setError(result.fieldErrors ? "Revise os campos destacados." : result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        toast.success(result.message);
        router.push(`/clientes/${result.slug ?? initial.slug}`);
      } catch (uploadError) {
        setError(uploadError instanceof MediaUploadError ? uploadError.message : "Não foi possível enviar o logo.");
      } finally {
        setProgress(null);
      }
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

      <Section {...SECTIONS.identity}>
        <Card>
          <CardContent>
            <FieldGroup>
              <LogoField
                name={values.name || "Cliente"}
                currentUrl={initial.logoUrl}
                logo={logo}
                onChange={setLogo}
                uploadsEnabled={uploadsEnabled}
                disabled={busy}
                progress={progress}
              />
              <Field data-invalid={!!fieldErrors.name}>
                <FieldLabel htmlFor="client-name">Nome</FieldLabel>
                <Input
                  id="client-name"
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  disabled={busy}
                  autoFocus={!editing}
                  autoComplete="off"
                />
                {fieldErrors.name ? (
                  <FieldError>{fieldErrors.name[0]}</FieldError>
                ) : (
                  !editing && (
                    <FieldDescription>O endereço da página do cliente sai do nome e não muda depois.</FieldDescription>
                  )
                )}
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </Section>

      <Section {...SECTIONS.links}>
        <Card>
          <CardContent>
            <div className="grid items-start gap-5 md:grid-cols-2">
              {CLIENT_LINK_KEYS.map((key) => (
                <LinkField
                  key={key}
                  linkKey={key}
                  value={values[key]}
                  onChange={(value) => set(key, value)}
                  error={fieldErrors[key]?.[0]}
                  disabled={busy}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section {...SECTIONS.audience}>
        <Card>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!fieldErrors.ageMax}>
                <div className="flex items-baseline justify-between gap-3">
                  <FieldLabel id="client-age-label">Faixa etária</FieldLabel>
                  <span className="text-sm font-medium tabular-nums">{formatAgeRange(values.ageMin, values.ageMax)}</span>
                </div>
                <Slider
                  aria-labelledby="client-age-label"
                  min={AGE_MIN}
                  max={AGE_MAX}
                  step={1}
                  value={[values.ageMin, values.ageMax]}
                  onValueChange={(value) => {
                    if (!Array.isArray(value)) return;
                    setValues((current) => ({ ...current, ageMin: value[0], ageMax: value[1] }));
                  }}
                  disabled={busy}
                  className="py-1"
                />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{AGE_MIN}</span>
                  <span>{AGE_MAX} anos</span>
                </div>
                <FieldError>{fieldErrors.ageMax?.[0]}</FieldError>
              </Field>
              <div className="grid items-start gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel id="client-genders-label">Gênero</FieldLabel>
                  <ChoiceChips
                    aria-labelledby="client-genders-label"
                    options={GENDER_OPTIONS}
                    value={values.genders}
                    onChange={(genders) => set("genders", genders)}
                    disabled={busy}
                  />
                </Field>
                <Field>
                  <FieldLabel id="client-classes-label">Classe social</FieldLabel>
                  <ChoiceChips
                    aria-labelledby="client-classes-label"
                    options={CLASS_OPTIONS}
                    value={values.socialClasses}
                    onChange={(classes) => set("socialClasses", classes)}
                    disabled={busy}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </Section>

      <Section {...SECTIONS.notes}>
        <Field data-invalid={!!fieldErrors.notes}>
          <FieldLabel id="client-notes-label" className="sr-only">
            Informações gerais
          </FieldLabel>
          <RichTextEditor
            aria-labelledby="client-notes-label"
            value={values.notes}
            onChange={(notes) => set("notes", notes)}
            placeholder="Ex.: tom de voz, cores e fontes da marca, contatos do cliente, aprovações... Dá para colar imagens."
            invalid={!!fieldErrors.notes}
            disabled={busy}
            onUploadImage={uploadsEnabled ? uploadNotesImage : undefined}
          />
          <FieldError>{fieldErrors.notes?.[0]}</FieldError>
        </Field>
      </Section>

      <div className="flex justify-end gap-2 border-t pt-6">
        <Link
          href={editing ? `/clientes/${initial.slug}` : "/clientes"}
          className={buttonVariants({ variant: "outline" })}
          aria-disabled={busy}
        >
          Cancelar
        </Link>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {progress !== null && progress < 1
            ? `Enviando logo ${Math.round(progress * 100)}%`
            : editing
              ? "Salvar alterações"
              : "Cadastrar cliente"}
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

function LinkField({
  linkKey,
  value,
  onChange,
  error,
  disabled,
}: {
  linkKey: ClientLink;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
}) {
  const Icon = CLIENT_LINK_ICONS[linkKey];
  const id = `client-${linkKey}`;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{CLIENT_LINKS[linkKey].label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <Icon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={CLIENT_LINKS[linkKey].placeholder}
          aria-invalid={!!error}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function LogoField({
  name,
  currentUrl,
  logo,
  onChange,
  uploadsEnabled,
  disabled,
  progress,
}: {
  name: string;
  currentUrl: string | null;
  logo: LogoState;
  onChange: (logo: LogoState) => void;
  uploadsEnabled: boolean;
  disabled: boolean;
  progress: number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const preview = logo.kind === "new" ? logo.preview : logo.kind === "removed" ? null : currentUrl;
  const canEdit = uploadsEnabled && !disabled && !preparing;

  // Libera a prévia local quando ela é trocada ou o formulário sai da tela.
  useEffect(() => () => {
    if (logo.kind === "new") URL.revokeObjectURL(logo.preview);
  }, [logo]);

  async function handleFile(file: File | undefined) {
    if (!file || !canEdit) return;
    setPreparing(true);
    try {
      const prepared = await prepareLogo(file);
      onChange({ kind: "new", file: prepared, preview: URL.createObjectURL(prepared) });
    } catch (error) {
      toast.error(error instanceof MediaUploadError ? error.message : "Não foi possível ler esta imagem.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Field>
      <FieldLabel>Logo</FieldLabel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={cn(
            "relative w-fit shrink-0 rounded-xl outline-offset-4 transition-[outline-color]",
            dragging ? "outline-2 outline-dashed outline-ring" : "outline-2 outline-transparent",
          )}
          onDragOver={(event) => {
            if (!canEdit) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFile(event.dataTransfer.files[0]);
          }}
        >
          <ClientLogo name={name} logoUrl={preview} className="size-20 rounded-xl text-lg" />
          {(preparing || progress !== null) && (
            <div className="absolute inset-0 grid place-items-center rounded-xl bg-background/75 text-xs font-medium tabular-nums">
              {progress !== null && progress < 1 ? (
                `${Math.round(progress * 100)}%`
              ) : (
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={!canEdit}>
              <ImageUpIcon />
              {preview ? "Trocar logo" : "Enviar logo"}
            </Button>
            {preview && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => onChange(currentUrl ? { kind: "removed" } : { kind: "keep" })}
                disabled={disabled || preparing}
              >
                <Trash2Icon />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {uploadsEnabled
              ? "PNG com fundo transparente fica melhor. Também dá para arrastar a imagem até o quadro."
              : "O envio de arquivos ainda não está configurado no servidor."}
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </Field>
  );
}
