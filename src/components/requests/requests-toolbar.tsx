"use client";

import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ClientLogo } from "@/components/client-logo";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  isRequestStatus,
  REQUEST_PAGE_SIZES,
  REQUEST_SITUATIONS,
  REQUEST_STATUSES,
  requestListHref,
  statusesOfSituation,
  type RequestListParams,
  type RequestSituation,
} from "@/lib/client-requests";
import { cn } from "@/lib/utils";
import { RequestStatusBadge } from "./request-status-badge";

// Filtros e paginação das listas de solicitações (equipe e portal), na URL.

const ALL = "all";

function useRequestListNavigation(params: RequestListParams, path: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Qualquer mudança de filtro volta para a primeira página.
  function navigate(next: Partial<RequestListParams>) {
    const href = requestListHref({ ...params, pagina: 1, ...next }, path);
    startTransition(() => router.replace(href, { scroll: false }));
  }
  return { isPending, navigate };
}

const segmentClass =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-control dark:aria-selected:bg-input/50";

type RequestsToolbarProps = {
  path: string;
  params: RequestListParams;
  /** Só na equipe: o filtro de cliente. */
  clients?: { id: string; name: string; logoUrl: string | null }[];
  searchPlaceholder: string;
};

export function RequestsToolbar({ path, params, clients, searchPlaceholder }: RequestsToolbarProps) {
  const { isPending, navigate } = useRequestListNavigation(params, path);
  const [query, setQuery] = useState(params.busca ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearchChange(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ busca: value.trim() || undefined }), 300);
  }

  // O filtro de status mostra só os do recorte (em aberto ou encerradas).
  const statusOptions = statusesOfSituation(params.situacao);
  const statusItems = {
    [ALL]: "Todos os status",
    ...Object.fromEntries(statusOptions.map((status) => [status, REQUEST_STATUSES[status].label])),
  };
  const clientOptions: PickerOption[] = (clients ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    icon: <ClientLogo name={item.name} logoUrl={item.logoUrl} className="size-5 text-[9px]" />,
  }));
  const hasFilters = Boolean(params.busca || params.status || params.cliente);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Situação" className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border bg-muted/40 p-0.5">
          {(Object.entries(REQUEST_SITUATIONS) as [RequestSituation, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={params.situacao === value}
              onClick={() =>
                navigate({
                  situacao: value,
                  // Status que não existe no outro recorte sai do filtro.
                  ...(params.status && !statusesOfSituation(value).includes(params.status) ? { status: undefined } : {}),
                })
              }
              className={segmentClass}
            >
              {label}
            </button>
          ))}
        </div>
        {isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Buscar solicitações"
          />
        </InputGroup>

        <Select
          items={statusItems}
          value={params.status ?? ALL}
          onValueChange={(value) => navigate({ status: isRequestStatus(value) ? value : undefined })}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                <RequestStatusBadge status={status} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {clients && (
          <SearchablePicker
            options={clientOptions}
            value={params.cliente ?? null}
            onChange={(value) => navigate({ cliente: value ?? undefined })}
            placeholder="Todos os clientes"
            searchPlaceholder="Buscar cliente..."
            emptyText="Nenhum cliente encontrado."
            clearable
            className="sm:w-56"
          />
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              clearTimeout(searchTimer.current);
              navigate({ busca: undefined, status: undefined, cliente: undefined });
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

/** Contagem, tamanho da página e navegação entre páginas. */
export function RequestsPagination({
  path,
  params,
  total,
  pageCount,
}: {
  path: string;
  params: RequestListParams;
  total: number;
  pageCount: number;
}) {
  const { navigate } = useRequestListNavigation(params, path);
  const page = Math.min(params.pagina, pageCount);
  const from = total === 0 ? 0 : (page - 1) * params.porPagina + 1;
  const to = Math.min(page * params.porPagina, total);
  const sizeItems = Object.fromEntries(REQUEST_PAGE_SIZES.map((size) => [String(size), `${size} por página`]));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? "Nenhuma solicitação" : `${from}–${to} de ${total} ${total === 1 ? "solicitação" : "solicitações"}`}
      </span>
      <div className="flex items-center gap-2">
        <Select items={sizeItems} value={String(params.porPagina)} onValueChange={(value) => value && navigate({ porPagina: Number(value) })}>
          <SelectTrigger size="sm" className="text-xs" aria-label="Solicitações por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REQUEST_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <PageLink href={requestListHref({ ...params, pagina: page - 1 }, path)} disabled={page <= 1} label="Página anterior">
              <ChevronLeftIcon />
            </PageLink>
            <span className="px-2 tabular-nums">
              {page} / {pageCount}
            </span>
            <PageLink href={requestListHref({ ...params, pagina: page + 1 }, path)} disabled={page >= pageCount} label="Próxima página">
              <ChevronRightIcon />
            </PageLink>
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const className = buttonVariants({ variant: "outline", size: "icon-sm" });
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className} scroll={false}>
      {children}
    </Link>
  );
}
