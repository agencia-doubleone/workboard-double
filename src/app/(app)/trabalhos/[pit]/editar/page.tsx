import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireSession } from "@/lib/session";
import { findJobByPit, listClientOptions, listJobStatuses, listTeamMembers } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { JobForm } from "../../job-form";
import { parsePit, toFormValues, toPersonView, toStatusOption } from "../../present";

export const metadata: Metadata = { title: "Editar trabalho" };

export default function EditarTrabalhoPage({ params }: PageProps<"/trabalhos/[pit]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditJobContent params={params} />
    </Suspense>
  );
}

async function EditJobContent({ params }: { params: PageProps<"/trabalhos/[pit]/editar">["params"] }) {
  await requireSession();
  const pit = parsePit((await params).pit);
  const found = pit ? await findJobByPit(db, pit) : null;
  if (!found) notFound();

  const [statuses, clients, team] = await Promise.all([
    listJobStatuses(db),
    listClientOptions(db, found.job.clientId),
    listTeamMembers(db),
  ]);
  // Quem já está no trabalho continua na lista mesmo se foi desativado depois.
  const teamIds = new Set(team.map((person) => person.id));
  const people = [...team, ...found.assignees.filter((person) => !teamIds.has(person.id))];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Editar #${found.job.pit} ${found.job.name}`}
        description="As mudanças ficam registradas no histórico do trabalho."
      />
      <JobForm
        initial={toFormValues(found)}
        statuses={statuses.map(toStatusOption)}
        clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
        people={people.map(toPersonView)}
        uploadsEnabled={isMediaConfigured()}
      />
    </div>
  );
}
