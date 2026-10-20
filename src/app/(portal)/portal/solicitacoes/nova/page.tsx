import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { PORTAL_REQUESTS_PATH } from "@/lib/portal";
import { requirePortalSession } from "@/lib/portal-session";
import { isMediaConfigured } from "@/server/media";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Nova solicitação" };

export default function NewPortalRequestPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={PORTAL_REQUESTS_PATH}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ArrowLeftIcon className="size-4" />
        Solicitações
      </Link>
      <PageHeader
        title="Nova solicitação"
        description="Peça o que precisar para a Double One. A equipe analisa e responde por aqui."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewRequestContent />
      </Suspense>
    </div>
  );
}

async function NewRequestContent() {
  // Só para conferir a sessão (o cliente sai dela na hora de salvar).
  await requirePortalSession();
  return (
    <ResetOnNavigation>
      <RequestForm uploadsEnabled={isMediaConfigured()} />
    </ResetOnNavigation>
  );
}
