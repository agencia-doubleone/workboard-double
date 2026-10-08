import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Clientes" description="Clientes atendidos pela agência." />
      <ComingSoon section="clientes" />
    </div>
  );
}
