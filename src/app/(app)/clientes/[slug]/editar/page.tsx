import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireAdmin } from "@/lib/session";
import { findClientBySlug, listClientDates } from "@/server/clients";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { ClientForm } from "../../client-form";
import { toFormValues } from "../../present";

export const metadata: Metadata = { title: "Editar cliente" };

export default function EditarClientePage({ params }: PageProps<"/clientes/[slug]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditClientContent params={params} />
    </Suspense>
  );
}

async function EditClientContent({ params }: { params: PageProps<"/clientes/[slug]/editar">["params"] }) {
  await requireAdmin();
  const { slug } = await params;
  const client = await findClientBySlug(db, slug);
  if (!client) notFound();
  const dates = await listClientDates(db, client.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`Editar ${client.name}`} description="As mudanças ficam registradas no histórico do cliente." />
      <ResetOnNavigation>
        <ClientForm
          initial={toFormValues(client, resolveMediaUrl(client.logoKey), dates)}
          uploadsEnabled={isMediaConfigured()}
        />
      </ResetOnNavigation>
    </div>
  );
}
