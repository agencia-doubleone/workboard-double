import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { requireAdmin } from "@/lib/session";
import { isMediaConfigured } from "@/server/media";
import { ClientForm } from "../client-form";
import { EMPTY_CLIENT_FORM } from "../present";

export const metadata: Metadata = { title: "Novo cliente" };

// Só admins cadastram: para os demais, requireAdmin() dá notFound().
export default function NovoClientePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewClientContent />
    </Suspense>
  );
}

async function NewClientContent() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Novo cliente" description="Cadastre o cliente; o cofre de senhas fica na página dele, depois de salvar." />
      <ClientForm initial={EMPTY_CLIENT_FORM} uploadsEnabled={isMediaConfigured()} />
    </div>
  );
}
