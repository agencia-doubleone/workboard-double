import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireSession } from "@/lib/session";
import { findDefaultJobStatus, listClientOptions, listJobStatuses, listTeamMembers } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { JobForm } from "../job-form";
import { toPersonView, toStatusOption } from "../present";

export const metadata: Metadata = { title: "Novo trabalho" };

export default function NovoTrabalhoPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewJobContent />
    </Suspense>
  );
}

async function NewJobContent() {
  await requireSession();
  const [statuses, defaultStatus, clients, people] = await Promise.all([
    listJobStatuses(db),
    findDefaultJobStatus(db),
    listClientOptions(db),
    listTeamMembers(db),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Novo trabalho" description="O PIT é gerado ao salvar. Depois, a conversa da equipe fica na página do trabalho." />
      <JobForm
        initial={{
          name: "",
          clientId: null,
          assigneeIds: [],
          dueDate: "",
          statusId: defaultStatus?.id ?? "",
          active: true,
          briefing: "",
        }}
        statuses={statuses.map(toStatusOption)}
        clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
        people={people.map(toPersonView)}
        uploadsEnabled={isMediaConfigured()}
      />
    </div>
  );
}
