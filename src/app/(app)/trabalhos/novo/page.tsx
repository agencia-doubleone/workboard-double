import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { parseRequestNumber, requestCode } from "@/lib/client-requests";
import { selectableStatuses } from "@/lib/jobs";
import { requireAdmin } from "@/lib/session";
import { findClientRequestByNumber } from "@/server/client-requests";
import { findDefaultJobStatus, listClientOptions, listJobStatuses, listTeamMembers } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { JobForm } from "../job-form";
import { toPersonView, toStatusOption } from "../present";

export const metadata: Metadata = { title: "Novo trabalho" };

// Só admins cadastram (o título fica dentro do Suspense, antes do notFound()).
// `?solicitacao=12` cria a partir da solicitação S-12: nome, cliente, briefing e
// previsão vêm dela, e o trabalho fica vinculado.
export default function NovoTrabalhoPage({ searchParams }: PageProps<"/trabalhos/novo">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewJobContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewJobContent({ searchParams }: { searchParams: PageProps<"/trabalhos/novo">["searchParams"] }) {
  await requireAdmin();
  const requestParam = (await searchParams).solicitacao;
  const requestNumber = typeof requestParam === "string" ? parseRequestNumber(requestParam) : null;
  const [statuses, defaultStatus, clients, people, source] = await Promise.all([
    listJobStatuses(db),
    findDefaultJobStatus(db),
    listClientOptions(db),
    listTeamMembers(db),
    requestNumber ? findClientRequestByNumber(db, requestNumber) : null,
  ]);
  const code = source ? requestCode(source.request.number) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Novo trabalho"
        description={
          code
            ? `A partir da solicitação ${code}. O PIT é gerado ao salvar.`
            : "O PIT é gerado ao salvar. Depois, a conversa da equipe fica na página do trabalho."
        }
      />
      {/* A chave muda com a solicitação: o formulário recomeça com os dados dela. */}
      <ResetOnNavigation key={source?.request.id ?? "blank"}>
        <JobForm
          initial={{
            name: source?.request.title ?? "",
            clientId: source?.client.id ?? null,
            assigneeIds: [],
            dueDate: source?.request.expectedOn ?? "",
            statusId: defaultStatus?.id ?? "",
            active: true,
            briefing: source?.request.briefing ?? "",
            fromRequest:
              source && code
                ? {
                    id: source.request.id,
                    code,
                    title: source.request.title,
                    href: `/solicitacoes/${source.request.number}`,
                  }
                : undefined,
          }}
          // Trabalho novo não começa cancelado.
          statuses={selectableStatuses(statuses.map(toStatusOption), null, true)}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
          people={people.map(toPersonView)}
          uploadsEnabled={isMediaConfigured()}
        />
      </ResetOnNavigation>
    </div>
  );
}
