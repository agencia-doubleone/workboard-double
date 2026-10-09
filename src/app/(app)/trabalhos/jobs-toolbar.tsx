"use client";

import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, SearchIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ClientLogo } from "@/components/client-logo";
import { JobStatusBadge } from "@/components/job-status-badge";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { JOB_PAGE_SIZES, JOB_SITUATIONS, type JobSituation } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { jobListHref, MY_JOBS, type JobListParams } from "./params";
import type { ClientOption, JobPersonView, JobStatusOption } from "./types";

const ALL = "all";

function useJobListNavigation(params: JobListParams) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Qualquer mudança de filtro volta para a primeira página.
  function navigate(next: Partial<JobListParams>) {
    const href = jobListHref({ ...params, pagina: 1, ...next });
    startTransition(() => router.replace(href, { scroll: false }));
  }
  return { isPending, navigate };
}

type JobsToolbarProps = {
  params: JobListParams;
  statuses: JobStatusOption[];
  clients: ClientOption[];
  people: JobPersonView[];
};

export function JobsToolbar({ params, statuses, clients, people }: JobsToolbarProps) {
  const { isPending, navigate } = useJobListNavigation(params);
  const [query, setQuery] = useState(params.busca ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearchChange(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ busca: value.trim() || undefined }), 300);
  }

  const statusItems = { [ALL]: "Todos os status", ...Object.fromEntries(statuses.map((status) => [status.id, status.name])) };
  const clientOptions: PickerOption[] = clients.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <ClientLogo name={item.name} logoUrl={item.logoUrl} className="size-5 text-[9px]" />,
  }));
  const personOptions: PickerOption[] = [
    {
      value: MY_JOBS,
      label: "Meus trabalhos",
      icon: (
        <span className="flex size-5 items-center justify-center rounded-md bg-primary-soft text-primary-ink">
          <UserIcon className="size-3" />
        </span>
      ),
    },
    ...people.map((person) => ({
      value: person.id,
      label: person.name,
      icon: <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-5 text-[9px]" />,
    })),
  ];
  const hasFilters = Boolean(params.busca || params.status || params.cliente || params.funcionario);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Situação" className="flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5">
          {(Object.entries(JOB_SITUATIONS) as [JobSituation, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={params.situacao === value}
              onClick={() => navigate({ situacao: value })}
              className="flex h-8 items-center rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-control dark:aria-selected:bg-input/50"
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
            placeholder="Buscar por PIT, trabalho ou cliente"
            aria-label="Buscar trabalhos"
          />
        </InputGroup>

        <Select
          items={statusItems}
          value={params.status ?? ALL}
          onValueChange={(value) => navigate({ status: value && value !== ALL ? value : undefined })}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                <JobStatusBadge name={status.name} textColor={status.textColor} backgroundColor={status.backgroundColor} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        <SearchablePicker
          options={personOptions}
          value={params.funcionario ?? null}
          onChange={(value) => navigate({ funcionario: value ?? undefined })}
          placeholder="Todos os funcionários"
          searchPlaceholder="Buscar pessoa..."
          emptyText="Ninguém encontrado."
          clearable
          className="sm:w-56"
        />

        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              clearTimeout(searchTimer.current);
              navigate({ busca: undefined, status: undefined, cliente: undefined, funcionario: undefined });
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

type JobsPaginationProps = {
  params: JobListParams;
  total: number;
  pageCount: number;
};

/** Contagem, tamanho da página e navegação entre páginas. */
export function JobsPagination({ params, total, pageCount }: JobsPaginationProps) {
  const { navigate } = useJobListNavigation(params);
  const page = Math.min(params.pagina, pageCount);
  const from = total === 0 ? 0 : (page - 1) * params.porPagina + 1;
  const to = Math.min(page * params.porPagina, total);
  const sizeItems = Object.fromEntries(JOB_PAGE_SIZES.map((size) => [String(size), `${size} por página`]));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? "Nenhum trabalho" : `${from}–${to} de ${total} ${total === 1 ? "trabalho" : "trabalhos"}`}
      </span>
      <div className="flex items-center gap-2">
        <Select
          items={sizeItems}
          value={String(params.porPagina)}
          onValueChange={(value) => value && navigate({ porPagina: Number(value) })}
        >
          <SelectTrigger size="sm" className="text-xs" aria-label="Trabalhos por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <PageLink href={jobListHref({ ...params, pagina: page - 1 })} disabled={page <= 1} label="Página anterior">
              <ChevronLeftIcon />
            </PageLink>
            <span className="px-2 tabular-nums">
              {page} / {pageCount}
            </span>
            <PageLink href={jobListHref({ ...params, pagina: page + 1 })} disabled={page >= pageCount} label="Próxima página">
              <ChevronRightIcon />
            </PageLink>
          </div>
        )}
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
