import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  type AuditAction,
  type AuditCategory,
} from "@/lib/audit";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AUDIT_PAGE_SIZE, listAuditLogs } from "@/server/audit/queries";
import { AuditFilters } from "./audit-filters";
import { AuditTable } from "./audit-table";
import { presentAuditRow } from "./present";

export const metadata: Metadata = { title: "Auditoria" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const CATEGORY_VALUES = Object.keys(AUDIT_CATEGORIES) as [AuditCategory, ...AuditCategory[]];
const ACTION_VALUES = Object.keys(AUDIT_ACTIONS) as [AuditAction, ...AuditAction[]];

// Parâmetros de URL inválidos são ignorados, nunca quebram a página.
const searchSchema = z.object({
  categoria: z.enum(CATEGORY_VALUES).optional().catch(undefined),
  acao: z.enum(ACTION_VALUES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  registro: z
    .string()
    .regex(/^[a-z_]+:[\w-]+$/)
    .optional()
    .catch(undefined),
});

export default async function AuditoriaPage({ searchParams }: PageProps<"/auditoria">) {
  await requireAdmin();
  const raw = await searchParams;
  const params = searchSchema.parse({
    categoria: first(raw.categoria),
    acao: first(raw.acao),
    q: first(raw.q),
    pagina: first(raw.pagina),
    registro: first(raw.registro),
  });

  const [entityType, entityId] = params.registro?.split(":") ?? [];
  const result = await listAuditLogs(db, {
    category: params.categoria,
    action: params.acao,
    search: params.q,
    entity: entityType && entityId ? { type: entityType, id: entityId } : undefined,
    page: params.pagina,
  });

  const now = new Date();
  const rows = result.rows.map((row) => presentAuditRow(row, now));
  const entityLabel = params.registro ? (rows[0]?.entity?.label ?? "registro") : null;

  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (params.categoria) query.set("categoria", params.categoria);
    if (params.acao) query.set("acao", params.acao);
    if (params.q) query.set("q", params.q);
    if (params.registro) query.set("registro", params.registro);
    if (page > 1) query.set("pagina", String(page));
    const qs = query.toString();
    return qs ? `/auditoria?${qs}` : "/auditoria";
  };

  const from = result.total === 0 ? 0 : (result.page - 1) * AUDIT_PAGE_SIZE + 1;
  const to = Math.min(result.page * AUDIT_PAGE_SIZE, result.total);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Auditoria"
        description="Registro de quem fez o quê no sistema. Visível apenas para administradores."
      />

      <div className="flex flex-col gap-3">
        <AuditFilters
          category={params.categoria}
          action={params.acao}
          search={params.q ?? ""}
          entity={params.registro ? { value: params.registro, label: entityLabel ?? "" } : null}
        />
        <AuditTable rows={rows} />

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {result.total === 0
              ? "Nenhum evento"
              : `${from}–${to} de ${result.total} ${result.total === 1 ? "evento" : "eventos"}`}
          </span>
          {result.pageCount > 1 && (
            <div className="flex items-center gap-1">
              <PageLink href={pageHref(result.page - 1)} disabled={result.page <= 1} label="Página anterior">
                <ChevronLeftIcon />
              </PageLink>
              <span className="px-2 tabular-nums">
                {result.page} / {result.pageCount}
              </span>
              <PageLink
                href={pageHref(result.page + 1)}
                disabled={result.page >= result.pageCount}
                label="Próxima página"
              >
                <ChevronRightIcon />
              </PageLink>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline", size: "icon-sm" }));
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
