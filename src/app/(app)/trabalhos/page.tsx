import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Trabalhos" };

export default function TrabalhosPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Trabalhos"
        description="Planilhas de controle dos trabalhos da agência."
      />
      <ComingSoon section="trabalhos" />
    </div>
  );
}
