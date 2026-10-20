import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { DEFAULT_JOB_SITUATION, JOB_SITUATIONS, SHEET_BOARD_LIMIT, todayInSaoPaulo } from "@/lib/jobs";
import { requireSession } from "@/lib/session";
import { listClientOptions, listJobs, listJobStatuses, listTeamMembers } from "@/server/jobs";
import { resolveMediaUrl } from "@/server/media";
import { JobsPagination, JobsToolbar } from "../trabalhos/jobs-toolbar";
import { RememberJobList } from "../trabalhos/job-list-memory";
import { JobsTable } from "../trabalhos/jobs-table";
import { jobListHref, parseJobListParams } from "../trabalhos/params";
import { toJobRow, toPersonView, toStatusOption } from "../trabalhos/present";
import { JobsBoard } from "./jobs-board";
import { PeopleTabs } from "./people-tabs";

export const metadata: Metadata = { title: "Minha planilha" };

// Os trabalhos em que a pessoa está vinculada, no mesmo formato da lista geral,
// na ordem que ela definiu arrastando (lista) ou num quadro por status (?visao=quadro).
// Admins ganham abas com a equipe ativa para abrir a planilha de cada um (?pessoa=).
export default function MinhaPlanilhaPage({ searchParams }: PageProps<"/minha-planilha">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SheetContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SheetContent({ searchParams }: { searchParams: PageProps<"/minha-planilha">["searchParams"] }) {
  const { user } = await requireSession();
  const isAdmin = user.role === "admin";
  const parsed = parseJobListParams(await searchParams);

  // Só admins escolhem de quem é a planilha. Pessoa desconhecida ou desativada
  // (ou qualquer ?pessoa= de quem não é admin) cai na planilha de quem está vendo.
  const team = isAdmin ? await listTeamMembers(db) : [];
  const owner = (parsed.pessoa && team.find((person) => person.id === parsed.pessoa)) || null;
  const ownerId = owner?.id ?? user.id;
  const viewingOther = ownerId !== user.id;
  const params = { ...parsed, funcionario: undefined, pessoa: viewingOther ? ownerId : undefined };

  const board = params.visao === "quadro";
  const [result, statuses, clients] = await Promise.all([
    listJobs(db, {
      // Não lidas e menções são sempre de quem está vendo, mesmo na planilha de outra pessoa.
      viewerId: user.id,
      situation: params.situacao,
      statusId: params.status,
      clientId: params.cliente,
      assigneeId: ownerId,
      order: "sheet",
      search: params.busca,
      // O quadro mostra tudo de uma vez (até o limite); a lista é paginada.
      page: board ? 1 : params.pagina,
      pageSize: board ? SHEET_BOARD_LIMIT : params.porPagina,
    }),
    listJobStatuses(db),
    listClientOptions(db, params.cliente),
  ]);
  // Página além da última (ex.: depois de filtrar): vai para a última que existe.
  if (!board && result.total > 0 && params.pagina > result.pageCount) {
    redirect(jobListHref({ ...params, pagina: result.pageCount }, "/minha-planilha"));
  }
  const today = todayInSaoPaulo();
  const canceledView = params.situacao === "cancelados";
  const filtered = Boolean(
    params.busca || params.status || params.cliente || (params.situacao !== DEFAULT_JOB_SITUATION && !canceledView),
  );
  const situation = canceledView ? "cancelado" : JOB_SITUATIONS[DEFAULT_JOB_SITUATION].toLowerCase();
  const statusOptions = statuses.map(toStatusOption);
  // Quadro: os status de cancelamento só viram coluna no recorte "Cancelados" (e lá, só eles).
  // Com filtro de status, só a coluna dele.
  const boardStatuses = statusOptions.filter(
    (status) => status.isCanceled === canceledView && (!params.status || status.id === params.status),
  );
  const rows = result.rows.map((item) => toJobRow(item, today));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={viewingOther && owner ? `Planilha de ${owner.name}` : "Minha planilha"}
        description={
          viewingOther
            ? "Os trabalhos em que essa pessoa está, do briefing à entrega."
            : "Os trabalhos em que você está, do briefing à entrega."
        }
        actions={
          isAdmin && (
            <Link href="/trabalhos/novo" className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Novo trabalho
            </Link>
          )
        }
      />
      {isAdmin && (
        <PeopleTabs people={team.map(toPersonView)} selectedId={ownerId} viewerId={user.id} params={params} />
      )}
      <RememberJobList href={jobListHref(params, "/minha-planilha")} label="Minha planilha" />
      <div className="flex flex-col gap-3">
        <JobsToolbar
          path="/minha-planilha"
          params={params}
          view={board ? "quadro" : "lista"}
          statuses={statusOptions}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
        />
        {board ? (
          <>
            <JobsBoard
              rows={rows}
              statuses={boardStatuses}
              ownerId={ownerId}
              finalColumnsAreDropOnly={params.situacao === "abertos"}
            />
            {result.total > rows.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando {rows.length} de {result.total} trabalhos. Use a busca ou os filtros para ver os outros.
              </p>
            )}
          </>
        ) : (
          <JobsTable
            returnTo={jobListHref(params, "/minha-planilha")}
            rows={rows}
            statuses={statusOptions}
            isAdmin={isAdmin}
            filtered={filtered}
            sheetOwnerId={ownerId}
            emptyMessage={
              viewingOther && owner
                ? {
                    title: `Nenhum trabalho ${situation}`,
                    description: `${owner.name} não está em nenhum trabalho ${situation}.`,
                  }
                : {
                    title: `Nenhum trabalho ${situation}`,
                    description: canceledView
                      ? "Trabalho cancelado sai da planilha e fica aqui."
                      : "Quando incluírem você num trabalho, ele aparece aqui.",
                  }
            }
          />
        )}
        {!board && result.total > 0 && (
          <JobsPagination path="/minha-planilha" params={params} total={result.total} pageCount={result.pageCount} />
        )}
      </div>
    </div>
  );
}
