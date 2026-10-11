"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KanbanIcon,
  ListIcon,
  Loader2Icon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useRef, useState, useTransition } from "react";

import { ClientLogo } from "@/components/client-logo";
import { JobStatusBadge } from "@/components/job-status-badge";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { JOB_PAGE_SIZES, JOB_SITUATIONS, SHEET_VIEWS, type JobSituation, type SheetView } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { jobListHref, MY_JOBS, type JobListParams, type JobListPath } from "./params";
import type { ClientOption, JobPersonView, JobStatusOption } from "./types";

const ALL = "all";

function useJobListNavigation(params: JobListParams, path: JobListPath) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Qualquer mudança de filtro volta para a primeira página.
  function navigate(next: Partial<JobListParams>) {
    const href = jobListHref({ ...params, pagina: 1, ...next }, path);
    startTransition(() => router.replace(href, { scroll: false }));
  }
  return { isPending, navigate };
}

type JobsToolbarProps = {
  /** Lista a que os filtros pertencem. */
  path: JobListPath;
  params: JobListParams;
  statuses: JobStatusOption[];
  clients: ClientOption[];
  /** Equipe para o filtro de funcionário (só na lista geral; sem isso, o filtro some). */
  people?: JobPersonView[];
  /** Minha planilha: visão atual, com o botão de alternar entre lista e quadro. */
  view?: SheetView;
};

const VIEW_ICONS = { lista: ListIcon, quadro: KanbanIcon } as const;

/** Botões em segmento (situação, visão): mesmo visual nos dois. */
const segmentClass =
  "flex h-8 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-control dark:aria-selected:bg-input/50 [&_svg]:size-4";

export function JobsToolbar({ path, params, statuses, clients, people, view }: JobsToolbarProps) {
  const { isPending, navigate } = useJobListNavigation(params, path);
  const [query, setQuery] = useState(params.busca ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearchChange(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ busca: value.trim() || undefined }), 300);
  }

  // Status de cancelamento só no recorte "Cancelados" (e lá, só eles).
  const canceledView = params.situacao === "cancelados";
  const statusOptions = statuses.filter((status) => status.isCanceled === canceledView);
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
    ...(people ?? []).map((person) => ({
      value: person.id,
      label: person.name,
      icon: <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-5 text-[9px]" />,
    })),
  ];
  const hasFilters = Boolean(params.busca || params.status || params.cliente || params.funcionario);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Situação"
          className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border bg-muted/40 p-0.5 sm:flex-nowrap"
        >
          {(Object.entries(JOB_SITUATIONS) as [JobSituation, string][]).map(([value, label]) => (
            <Fragment key={value}>
              {/* Os cancelados ficam à parte: não entram em nenhum outro recorte. */}
              {value === "cancelados" && <span aria-hidden="true" className="my-1.5 hidden w-px shrink-0 bg-border sm:block" />}
              <button
                type="button"
                role="tab"
                aria-selected={params.situacao === value}
                onClick={() =>
                  navigate({
                    situacao: value,
                    // O filtro de status não vale do outro lado (cancelados x os demais).
                    ...((value === "cancelados") !== canceledView ? { status: undefined } : {}),
                  })
                }
                className={cn(segmentClass, "shrink-0")}
              >
                {label}
              </button>
            </Fragment>
          ))}
        </div>
        {isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
        {view && (
          <div role="tablist" aria-label="Visualização" className="ml-auto flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5">
            {(Object.entries(SHEET_VIEWS) as [SheetView, string][]).map(([value, label]) => {
              const Icon = VIEW_ICONS[value];
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => navigate({ visao: value === "quadro" ? "quadro" : undefined })}
                  className={segmentClass}
                >
                  <Icon />
                  {label}
                </button>
              );
            })}
          </div>
        )}
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
            {statusOptions.map((status) => (
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

        {people && (
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
        )}

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
  path: JobListPath;
  params: JobListParams;
  total: number;
  pageCount: number;
};

/** Contagem, tamanho da página e navegação entre páginas. */
export function JobsPagination({ path, params, total, pageCount }: JobsPaginationProps) {
  const { navigate } = useJobListNavigation(params, path);
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
            <PageLink href={jobListHref({ ...params, pagina: page - 1 }, path)} disabled={page <= 1} label="Página anterior">
              <ChevronLeftIcon />
            </PageLink>
            <span className="px-2 tabular-nums">
              {page} / {pageCount}
            </span>
            <PageLink href={jobListHref({ ...params, pagina: page + 1 }, path)} disabled={page >= pageCount} label="Próxima página">
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
