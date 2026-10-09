import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireAdmin } from "@/lib/session";
import { countJobsByStatus, listJobStatuses } from "@/server/jobs";
import { StatusesManager, type StatusRow } from "./statuses-manager";

export const metadata: Metadata = { title: "Status de trabalhos" };

export default function StatusDeTrabalhosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StatusesContent />
    </Suspense>
  );
}

async function StatusesContent() {
  await requireAdmin();
  const [statuses, usage] = await Promise.all([listJobStatuses(db), countJobsByStatus(db)]);
  const rows: StatusRow[] = statuses.map((status) => ({
    id: status.id,
    name: status.name,
    textColor: status.textColor,
    backgroundColor: status.backgroundColor,
    isDefault: status.isDefault,
    isFinal: status.isFinal,
    jobCount: usage.get(status.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Status de trabalhos"
        description="As etapas de um trabalho, na ordem em que aparecem. Todo trabalho novo começa no status padrão; os que encerram tiram o trabalho da lista do dia a dia."
      />
      <StatusesManager rows={rows} />
    </div>
  );
}
