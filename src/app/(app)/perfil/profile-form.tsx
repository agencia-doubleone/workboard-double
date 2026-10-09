"use client";

import { AlertCircleIcon, ImageUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { PasswordField } from "@/components/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { AVATAR_ACCEPT, prepareAvatar } from "@/lib/avatar-image";
import { MediaUploadError, uploadMedia } from "@/lib/media-upload";
import { cn } from "@/lib/utils";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validations/profile";
import {
  changePassword,
  removeAvatar,
  updateAvatar,
  updateProfile,
  type ProfileActionResult,
} from "./actions";

type ProfileUser = { name: string; email: string; imageUrl: string | null; birthday: string | null };
type FieldErrors = Record<string, string[] | undefined>;

const SECTIONS = {
  photo: { title: "Foto", description: "Aparece no menu e na lista de usuários. Não é obrigatória." },
  details: { title: "Dados pessoais", description: "Como a equipe vê você no Workboard." },
  password: {
    title: "Senha",
    description: "Ao trocar, você continua conectado aqui e as outras sessões são encerradas.",
  },
};

export function ProfileForm({ user, uploadsEnabled }: { user: ProfileUser; uploadsEnabled: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <Section {...SECTIONS.photo}>
        <PhotoCard user={user} uploadsEnabled={uploadsEnabled} />
      </Section>
      <Section {...SECTIONS.details}>
        <DetailsCard user={user} />
      </Section>
      <Section {...SECTIONS.password}>
        <PasswordCard email={user.email} />
      </Section>
    </div>
  );
}

/** Enquanto a sessão carrega: os textos das seções já aparecem, os cards ficam em esqueleto. */
export function ProfileFormSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <Section {...SECTIONS.photo}>
        <Skeleton className="h-30 rounded-xl" />
      </Section>
      <Section {...SECTIONS.details}>
        <Skeleton className="h-64 rounded-xl" />
      </Section>
      <Section {...SECTIONS.password}>
        <Skeleton className="h-64 rounded-xl" />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
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

/** Mostra o erro geral e os de campo de uma Server Action; toast no sucesso. */
function useProfileAction() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function run(action: () => Promise<ProfileActionResult>, onSuccess?: () => void) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        onSuccess?.();
        return;
      }
      setError(result.fieldErrors ? null : result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  function showValidation(issues: z.ZodError) {
    setError(null);
    setFieldErrors(z.flattenError(issues).fieldErrors as FieldErrors);
  }

  return { isPending, error, fieldErrors, run, showValidation };
}

/** Duas colunas quando o card tem largura (container query do FieldGroup). */
function FieldColumns({ children }: { children: React.ReactNode }) {
  return <div className="grid items-start gap-5 @2xl/field-group:grid-cols-2">{children}</div>;
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function PhotoCard({ user, uploadsEnabled }: { user: ProfileUser; uploadsEnabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<number | null>(null);
  // Prévia local enquanto envia (e depois, até a página sair: é a mesma imagem).
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = isPending || progress !== null;
  const imageUrl = preview ?? user.imageUrl;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function handleFile(file: File | undefined) {
    if (!file || busy || !uploadsEnabled) return;
    startTransition(async () => {
      try {
        const photo = await prepareAvatar(file);
        setPreview(URL.createObjectURL(photo));
        setProgress(0);
        const item = await uploadMedia(photo, { folder: "usuarios", onProgress: setProgress });
        const result = await updateAvatar({ mediaId: item.id });
        if (!result.ok) throw new MediaUploadError(result.error);
        toast.success(result.message);
      } catch (error) {
        setPreview(null);
        toast.error(error instanceof MediaUploadError ? error.message : "Não foi possível enviar a foto.");
      } finally {
        setProgress(null);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeAvatar();
      if (result.ok) {
        setPreview(null);
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className={cn(
            "relative w-fit shrink-0 rounded-2xl outline-offset-4 transition-[outline-color]",
            dragging ? "outline-2 outline-dashed outline-ring" : "outline-2 outline-transparent",
          )}
          onDragOver={(event) => {
            if (!uploadsEnabled || busy) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFile(event.dataTransfer.files[0]);
          }}
        >
          <UserAvatar
            name={user.name}
            imageUrl={imageUrl}
            alt={`Foto de ${user.name}`}
            className="size-20 rounded-2xl"
            fallbackClassName="text-xl"
          />
          {busy && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/75 text-xs font-medium tabular-nums">
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
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={!uploadsEnabled || busy}
            >
              <ImageUpIcon />
              {user.imageUrl ? "Trocar foto" : "Enviar foto"}
            </Button>
            {user.imageUrl && (
              <Button variant="destructive" onClick={handleRemove} disabled={busy}>
                <Trash2Icon />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {uploadsEnabled
              ? "JPG, PNG ou WebP, até 20 MB. Recortada no centro, em quadrado. Também dá para arrastar a imagem até a foto."
              : "O envio de fotos ainda não está configurado no servidor."}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}

function DetailsCard({ user }: { user: ProfileUser }) {
  const [name, setName] = useState(user.name);
  const [birthday, setBirthday] = useState(user.birthday ?? "");
  const { isPending, error, fieldErrors, run, showValidation } = useProfileAction();
  const dirty = name.trim() !== user.name || birthday !== (user.birthday ?? "");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({ name, birthday });
    if (!parsed.success) return showValidation(parsed.error);
    run(() => updateProfile(parsed.data), () => setName(parsed.data.name));
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="contents">
        <CardContent>
          <FieldGroup>
            <FormError message={error} />
            <FieldColumns>
              <Field data-invalid={!!fieldErrors.name}>
                <FieldLabel htmlFor="profile-name">Nome</FieldLabel>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  disabled={isPending}
                  autoComplete="name"
                />
                <FieldError>{fieldErrors.name?.[0]}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-email">E-mail</FieldLabel>
                <Input id="profile-email" value={user.email} readOnly disabled />
                <FieldDescription>Para trocar o e-mail, fale com um administrador.</FieldDescription>
              </Field>
              <Field data-invalid={!!fieldErrors.birthday}>
                <FieldLabel htmlFor="profile-birthday">Aniversário</FieldLabel>
                <DatePicker
                  id="profile-birthday"
                  value={birthday}
                  onChange={setBirthday}
                  invalid={!!fieldErrors.birthday}
                  disabled={isPending}
                  fromYear={1900}
                  disableFuture
                />
                {fieldErrors.birthday ? (
                  <FieldError>{fieldErrors.birthday[0]}</FieldError>
                ) : (
                  <FieldDescription>Opcional. No dia, o Workboard comemora com você.</FieldDescription>
                )}
              </Field>
            </FieldColumns>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Salvar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordCard({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { isPending, error, fieldErrors, run, showValidation } = useProfileAction();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return showValidation(parsed.error);
    run(
      () => changePassword(parsed.data),
      () => {
        setCurrentPassword("");
        setNewPassword("");
      },
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="contents">
        <CardContent>
          {/* Para gerenciadores de senha associarem a nova senha à conta. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <FieldGroup>
            <FormError message={error} />
            <FieldColumns>
              <Field data-invalid={!!fieldErrors.currentPassword}>
                <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
                <PasswordField
                  id="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  invalid={!!fieldErrors.currentPassword}
                  disabled={isPending}
                  autoComplete="current-password"
                />
                <FieldError>{fieldErrors.currentPassword?.[0]}</FieldError>
              </Field>
              <Field data-invalid={!!fieldErrors.newPassword}>
                <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
                <PasswordField
                  id="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  invalid={!!fieldErrors.newPassword}
                  disabled={isPending}
                  generator
                />
                <FieldDescription>Pelo menos 8 caracteres.</FieldDescription>
                <FieldError>{fieldErrors.newPassword?.[0]}</FieldError>
              </Field>
            </FieldColumns>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!currentPassword || !newPassword || isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Alterar senha
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
