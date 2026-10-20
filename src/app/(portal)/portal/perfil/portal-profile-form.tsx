"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ClientLogo } from "@/components/client-logo";
import { ProfilePhotoCard } from "@/components/profile/profile-photo-card";
import { ProfileSection } from "@/components/profile/profile-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { uploadMedia } from "@/lib/media-upload";
import { updatePortalProfileSchema } from "@/lib/validations/portal";
import { removePortalAvatar, updatePortalAvatar, updatePortalProfile } from "./actions";

export type PortalProfile = {
  name: string;
  email: string;
  imageUrl: string | null;
  client: { name: string; logoUrl: string | null };
};

type FieldErrors = Record<string, string[] | undefined>;

const SECTIONS = {
  photo: { title: "Foto", description: "Aparece no menu do portal e para a equipe da Double One. Não é obrigatória." },
  details: { title: "Seus dados", description: "Como a equipe da Double One vê você no portal." },
};

export function PortalProfileForm({ profile, uploadsEnabled }: { profile: PortalProfile; uploadsEnabled: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <ProfileSection {...SECTIONS.photo}>
        <ProfilePhotoCard
          name={profile.name}
          imageUrl={profile.imageUrl}
          uploadsEnabled={uploadsEnabled}
          onUpload={async (photo, onProgress) => {
            const item = await uploadMedia(photo, { folder: "portal", via: "portal", onProgress });
            return updatePortalAvatar({ mediaId: item.id });
          }}
          onRemove={removePortalAvatar}
        />
      </ProfileSection>
      <ProfileSection {...SECTIONS.details}>
        <DetailsCard profile={profile} />
      </ProfileSection>
    </div>
  );
}

/** Enquanto a sessão carrega: os textos das seções já aparecem, os cards ficam em esqueleto. */
export function PortalProfileFormSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <ProfileSection {...SECTIONS.photo}>
        <Skeleton className="h-30 rounded-xl" />
      </ProfileSection>
      <ProfileSection {...SECTIONS.details}>
        <Skeleton className="h-64 rounded-xl" />
      </ProfileSection>
    </div>
  );
}

function DetailsCard({ profile }: { profile: PortalProfile }) {
  const [name, setName] = useState(profile.name);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const dirty = name.trim() !== profile.name;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = updatePortalProfileSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    setFieldErrors({});
    startTransition(async () => {
      const result = await updatePortalProfile(parsed.data);
      if (result.ok) {
        toast.success(result.message);
        setName(parsed.data.name);
        return;
      }
      setError(result.fieldErrors ? null : result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="contents">
        <CardContent>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid items-start gap-5 @2xl/field-group:grid-cols-2">
              <Field data-invalid={!!fieldErrors.name}>
                <FieldLabel htmlFor="portal-profile-name">Nome</FieldLabel>
                <Input
                  id="portal-profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  disabled={isPending}
                  autoComplete="name"
                />
                <FieldError>{fieldErrors.name?.[0]}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-profile-email">E-mail</FieldLabel>
                <Input id="portal-profile-email" value={profile.email} readOnly disabled />
                <FieldDescription>
                  É por ele que você entra (com o código). Para trocar, fale com a equipe da Double One.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Empresa</FieldLabel>
                <div className="flex h-10 items-center gap-2.5 rounded-md border bg-muted/40 px-3 text-sm">
                  <ClientLogo
                    name={profile.client.name}
                    logoUrl={profile.client.logoUrl}
                    className="size-6 text-[9px]"
                  />
                  <span className="truncate">{profile.client.name}</span>
                </div>
              </Field>
            </div>
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
