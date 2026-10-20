import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { parseRequestNumber, requestCode } from "@/lib/client-requests";
import { requireAdmin } from "@/lib/session";
import { findClientRequestByNumber, hasClientParticipation } from "@/server/client-requests";
import { listClientOptions } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { RequestForm } from "../../request-form";

export const metadata: Metadata = { title: "Editar solicitação" };

export default function EditarSolicitacaoPage({ params }: PageProps<"/solicitacoes/[numero]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditRequestContent params={params} />
    </Suspense>
  );
}

async function EditRequestContent({ params }: { params: PageProps<"/solicitacoes/[numero]/editar">["params"] }) {
  await requireAdmin();
  const number = parseRequestNumber((await params).numero);
  const found = number ? await findClientRequestByNumber(db, number) : null;
  if (!found) notFound();
  const { request } = found;

  const [clients, clientLocked] = await Promise.all([
    // O cliente atual entra mesmo se tiver sido arquivado depois.
    listClientOptions(db, request.clientId),
    hasClientParticipation(db, request),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Editar ${requestCode(request.number)} ${request.title}`}
        description="O cliente vê as mudanças no portal: as do assunto, do briefing, do status e da previsão entram no andamento."
      />
      <ResetOnNavigation>
        <RequestForm
          initial={{
            requestId: request.id,
            number: request.number,
            clientId: request.clientId,
            title: request.title,
            briefing: request.briefing,
            status: request.status,
            expectedOn: request.expectedOn ?? "",
          }}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
          clientLocked={clientLocked}
          uploadsEnabled={isMediaConfigured()}
        />
      </ResetOnNavigation>
    </div>
  );
}
