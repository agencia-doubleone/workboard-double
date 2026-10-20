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
import { requireAdmin } from "@/lib/session";
import { listClientRequests } from "@/server/client-requests";
import { listClientOptions } from "@/server/jobs";
import { resolveMediaUrl } from "@/server/media";
import { RequestsTable } from "./requests-table";

export const metadata: Metadata = { title: "Solicitações" };

const PATH = "/solicitacoes";

// Pedidos que os clientes fazem pelo portal (ou a equipe cadastra por eles). Só admins (o título fica dentro do
// Suspense, antes do notFound()).
export default function SolicitacoesPage({ searchParams }: PageProps<"/solicitacoes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequestsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestsContent({ searchParams }: { searchParams: PageProps<"/solicitacoes">["searchParams"] }) {
  const { user } = await requireAdmin();
  const params = parseRequestListParams(await searchParams);

  const [result, clients] = await Promise.all([
    listClientRequests(db, {
      viewer: { kind: "team", userId: user.id, since: user.createdAt },
      situation: params.situacao,
      status: params.status,
      clientId: params.cliente,
      search: params.busca,
      page: params.pagina,
      pageSize: params.porPagina,
    }),
    listClientOptions(db, params.cliente),
  ]);
  // Página além da última (ex.: depois de filtrar): vai para a última que existe.
  if (result.total > 0 && params.pagina > result.pageCount) redirect(requestListHref({ ...params, pagina: result.pageCount }, PATH));
  const filtered = Boolean(params.busca || params.status || params.cliente || params.situacao !== DEFAULT_REQUEST_SITUATION);
  const today = todayInSaoPaulo();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Solicitações"
        description="O que os clientes pedem pelo portal: status, previsão de entrega e a conversa com eles."
        actions={
          <Link href="/solicitacoes/nova" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            Nova solicitação
          </Link>
        }
      />
      <div className="flex flex-col gap-3">
        <RequestsToolbar
          path={PATH}
          params={params}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
          searchPlaceholder="Buscar por número, assunto ou cliente"
        />
        <RequestsTable rows={result.rows.map((row) => toRequestRow(row, today))} filtered={filtered} />
        {result.total > 0 && (
          <RequestsPagination path={PATH} params={params} total={result.total} pageCount={result.pageCount} />
        )}
      </div>
    </div>
  );
}
