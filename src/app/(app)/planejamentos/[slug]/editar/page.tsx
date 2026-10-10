import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireSession } from "@/lib/session";
import { listTeamMembers } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { findPlanningBySlug } from "@/server/planning";
import { DeletePlanningButton } from "../../delete-planning-button";
import { PlanningForm } from "../../planning-form";

export const metadata: Metadata = { title: "Editar planejamento" };

export default function EditarPlanejamentoPage({ params }: PageProps<"/planejamentos/[slug]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditPlanningContent params={params} />
    </Suspense>
  );
}

async function EditPlanningContent({ params }: { params: PageProps<"/planejamentos/[slug]/editar">["params"] }) {
  const { user } = await requireSession();
  const found = await findPlanningBySlug(db, (await params).slug);
  if (!found) notFound();
  const team = await listTeamMembers(db);
  // Quem já é responsável e foi desativado continua aparecendo para poder sair da lista.
  const people = [...team, ...found.members.filter((member) => !team.some((person) => person.id === member.id))];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Planejamento de ${found.client.name}`}
        description="Redes, meta de posts, responsáveis e as informações gerais."
        actions={
          user.role === "admin" ? (
            <DeletePlanningButton planningId={found.planning.id} clientName={found.client.name} />
          ) : null
        }
      />
      <PlanningForm
        initial={{
          planningId: found.planning.id,
          clientId: found.client.id,
          networks: found.planning.networks,
          postsPerMonth: found.planning.postsPerMonth ? String(found.planning.postsPerMonth) : "",
          overview: found.planning.overview ?? "",
          memberIds: found.members.map((person) => person.id),
        }}
        clients={[]}
        client={{ name: found.client.name, slug: found.client.slug, logoUrl: resolveMediaUrl(found.client.logoKey) }}
        people={people.map((person) => ({ id: person.id, name: person.name, imageUrl: resolveMediaUrl(person.image) }))}
        uploadsEnabled={isMediaConfigured()}
      />
    </div>
  );
}
