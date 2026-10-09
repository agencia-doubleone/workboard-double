import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { DEFAULT_JOB_SITUATION, todayInSaoPaulo } from "@/lib/jobs";
import { requireSession } from "@/lib/session";
import { listClientOptions, listJobs, listJobStatuses, listTeamMembers } from "@/server/jobs";
import { resolveMediaUrl } from "@/server/media";
import { JobsPagination, JobsToolbar } from "./jobs-toolbar";
import { JobsTable } from "./jobs-table";
import { jobListHref, MY_JOBS, parseJobListParams } from "./params";
import { toJobRow, toPersonView, toStatusOption } from "./present";

export const metadata: Metadata = { title: "Trabalhos" };

// Toda a equipe vê, cadastra e edita trabalhos; só admins excluem.
export default function TrabalhosPage({ searchParams }: PageProps<"/trabalhos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function JobsContent({ searchParams }: { searchParams: PageProps<"/trabalhos">["searchParams"] }) {
  const { user } = await requireSession();
  const params = parseJobListParams(await searchParams);

  const [result, statuses, clients, people] = await Promise.all([
    listJobs(db, {
      viewerId: user.id,
      situation: params.situacao,
      statusId: params.status,
      clientId: params.cliente,
      assigneeId: params.funcionario === MY_JOBS ? user.id : params.funcionario,
      search: params.busca,
      page: params.pagina,
      pageSize: params.porPagina,
    }),
    listJobStatuses(db),
    listClientOptions(db, params.cliente),
    listTeamMembers(db),
  ]);
  // Página além da última (ex.: depois de filtrar): vai para a última que existe.
  if (result.total > 0 && params.pagina > result.pageCount) redirect(jobListHref({ ...params, pagina: result.pageCount }));
  const today = todayInSaoPaulo();
  const filtered = Boolean(
    params.busca || params.status || params.cliente || params.funcionario || params.situacao !== DEFAULT_JOB_SITUATION,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trabalhos"
        description="Trabalhos da agência, do briefing à entrega, com a conversa da equipe."
        actions={
          <Link href="/trabalhos/novo" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            Novo trabalho
          </Link>
        }
      />
      <div className="flex flex-col gap-3">
        <JobsToolbar
          params={params}
          statuses={statuses.map(toStatusOption)}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
          people={people.map(toPersonView)}
        />
        <JobsTable
          rows={result.rows.map((item) => toJobRow(item, today))}
          statuses={statuses.map(toStatusOption)}
          isAdmin={user.role === "admin"}
          filtered={filtered}
        />
        {result.total > 0 && <JobsPagination params={params} total={result.total} pageCount={result.pageCount} />}
      </div>
    </div>
  );
}
