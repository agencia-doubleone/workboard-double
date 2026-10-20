import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { INITIAL_REQUEST_STATUS } from "@/lib/client-requests";
import { requireAdmin } from "@/lib/session";
import { listClientOptions } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { RequestForm } from "../request-form";

export const metadata: Metadata = { title: "Nova solicitação" };

// A equipe cadastra em nome do cliente (pedido que chegou por telefone, e-mail...).
// Só admins (o título fica dentro do Suspense, antes do notFound()).
export default function NovaSolicitacaoPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewRequestContent />
    </Suspense>
  );
}

async function NewRequestContent() {
  await requireAdmin();
  const clients = await listClientOptions(db);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Nova solicitação"
        description="Para um pedido que chegou por fora do portal. O cliente vê no portal, como aberta pela Double One."
      />
      <ResetOnNavigation>
        <RequestForm
          initial={{ clientId: null, title: "", briefing: "", status: INITIAL_REQUEST_STATUS, expectedOn: "" }}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
          uploadsEnabled={isMediaConfigured()}
        />
      </ResetOnNavigation>
    </div>
  );
}
