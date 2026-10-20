import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { requirePortalSession } from "@/lib/portal-session";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { PortalProfileForm, PortalProfileFormSkeleton } from "./portal-profile-form";

export const metadata: Metadata = { title: "Meu perfil · Portal do cliente" };

// Como o /perfil da equipe: título na hora, só os cards esperam a sessão (Cache Components).
export default function PortalProfilePage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Meu perfil" description="Seu nome e sua foto aparecem para a equipe da Double One." />
      <Suspense fallback={<PortalProfileFormSkeleton />}>
        <PortalProfileContent />
      </Suspense>
    </div>
  );
}

async function PortalProfileContent() {
  const { contact, client } = await requirePortalSession();
  return (
    <ResetOnNavigation>
      <PortalProfileForm
        profile={{
          name: contact.name,
          email: contact.email,
          imageUrl: resolveMediaUrl(contact.image),
          client: { name: client.name, logoUrl: resolveMediaUrl(client.logoKey) },
        }}
        uploadsEnabled={isMediaConfigured()}
      />
    </ResetOnNavigation>
  );
}
