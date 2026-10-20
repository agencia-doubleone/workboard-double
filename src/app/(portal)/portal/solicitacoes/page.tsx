import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { toRequestRow } from "@/components/requests/present";
import { RequestsPagination, RequestsToolbar } from "@/components/requests/requests-toolbar";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { DEFAULT_REQUEST_SITUATION, parseRequestListParams, requestListHref } from "@/lib/client-requests";
import { todayInSaoPaulo } from "@/lib/jobs";
import { PORTAL_NEW_REQUEST_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";
import { requirePortalSession } from "@/lib/portal-session";
import { listClientRequests } from "@/server/client-requests";
import { PortalRequestsTable } from "./portal-requests-table";

export const metadata: Metadata = { title: "Solicitações" };

export default function PortalRequestsPage({ searchParams }: PageProps<"/portal/solicitacoes">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Solicitações"
        description="O que você pediu para a Double One: o status, a previsão de entrega e a conversa com a equipe."
        actions={
          <Link href={PORTAL_NEW_REQUEST_PATH} className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            Nova solicitação
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <RequestsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function RequestsContent({ searchParams }: { searchParams: PageProps<"/portal/solicitacoes">["searchParams"] }) {
  const { contact, client } = await requirePortalSession();
  // O filtro de cliente não existe no portal: vale sempre o do contato.
  const params = { ...parseRequestListParams(await searchParams), cliente: undefined };
  const result = await listClientRequests(db, {
    viewer: { kind: "portal", portalUserId: contact.id, clientId: client.id, since: contact.createdAt },
    situation: params.situacao,
    status: params.status,
    search: params.busca,
    page: params.pagina,
    pageSize: params.porPagina,
  });
  if (result.total > 0 && params.pagina > result.pageCount) {
    redirect(requestListHref({ ...params, pagina: result.pageCount }, PORTAL_REQUESTS_PATH));
  }
  const filtered = Boolean(params.busca || params.status || params.situacao !== DEFAULT_REQUEST_SITUATION);
  const today = todayInSaoPaulo();

  return (
    <div className="flex flex-col gap-3">
      <RequestsToolbar path={PORTAL_REQUESTS_PATH} params={params} searchPlaceholder="Buscar por número ou assunto" />
      <PortalRequestsTable rows={result.rows.map((row) => toRequestRow(row, today))} filtered={filtered} />
      {result.total > 0 && (
        <RequestsPagination path={PORTAL_REQUESTS_PATH} params={params} total={result.total} pageCount={result.pageCount} />
      )}
    </div>
  );
}
