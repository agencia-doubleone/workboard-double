import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireSession } from "@/lib/session";
import { listTeamMembers } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { listClientsWithoutPlanning } from "@/server/planning";
import { PlanningForm } from "../planning-form";

export const metadata: Metadata = { title: "Novo planejamento" };

export default function NovoPlanejamentoPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewPlanningContent />
    </Suspense>
  );
}

async function NewPlanningContent() {
  await requireSession();
  const [clients, people] = await Promise.all([listClientsWithoutPlanning(db), listTeamMembers(db)]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Novo planejamento"
        description="Escolha o cliente. Depois, cada mês ganha os posts (importados do JSON ou cadastrados um a um) e o próprio status."
      />
      <ResetOnNavigation>
        <PlanningForm
          initial={{ clientId: null, networks: ["instagram"], postsPerMonth: "", overview: "", memberIds: [] }}
          clients={clients.map((item) => ({ id: item.id, name: item.name, logoUrl: resolveMediaUrl(item.logoKey) }))}
          people={people.map((person) => ({ id: person.id, name: person.name, imageUrl: resolveMediaUrl(person.image) }))}
          uploadsEnabled={isMediaConfigured()}
        />
      </ResetOnNavigation>
    </div>
  );
}
