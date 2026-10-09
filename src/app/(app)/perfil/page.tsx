import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/session";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { ProfileForm, ProfileFormSkeleton } from "./profile-form";

export const metadata: Metadata = { title: "Meu perfil" };

// Título e textos das seções aparecem na hora; só os cards esperam a sessão,
// que é lida dentro do <Suspense> (Cache Components).
export default function PerfilPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Meu perfil"
        description="Seu nome e sua foto aparecem para a equipe no Workboard."
      />
      <Suspense fallback={<ProfileFormSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

async function ProfileContent() {
  const { user } = await requireSession();
  return (
    <ProfileForm
      user={{ name: user.name, email: user.email, imageUrl: resolveMediaUrl(user.image) }}
      uploadsEnabled={isMediaConfigured()}
    />
  );
}
