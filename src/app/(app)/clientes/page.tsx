import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { countArchivedClients, listClients } from "@/server/clients";
import { resolveMediaUrl } from "@/server/media";
import { ClientsTable } from "./clients-table";
import { clientLinks, describeAudience } from "./present";
import type { ClientRow } from "./types";

export const metadata: Metadata = { title: "Clientes" };

// Toda a equipe vê os clientes; só admins cadastram e veem os arquivados (?arquivados=1).
export default function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ClientsContent({ searchParams }: { searchParams: PageProps<"/clientes">["searchParams"] }) {
  const { user } = await requireSession();
  const isAdmin = user.role === "admin";
  const { arquivados } = await searchParams;
  const archived = isAdmin && arquivados === "1";
  const [clients, archivedCount] = await Promise.all([
    listClients(db, { archived }),
    isAdmin ? countArchivedClients(db) : Promise.resolve(0),
  ]);
  const now = new Date();

  const rows: ClientRow[] = clients.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    logoUrl: resolveMediaUrl(item.logoKey),
    website: item.website,
    socials: clientLinks(item).filter((link) => link.key !== "website"),
    audience: describeAudience(item),
    credentialCount: item.credentialCount ?? 0,
    updated: { relative: formatRelative(item.updatedAt, now), absolute: formatDateTime(item.updatedAt) },
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Clientes atendidos pela agência, com público-alvo, informações e acessos."
        actions={
          isAdmin && (
            <Link href="/clientes/novo" className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Novo cliente
            </Link>
          )
        }
      />
      <ClientsTable rows={rows} isAdmin={isAdmin} archived={archived} archivedCount={archivedCount} />
    </div>
  );
}
