"use client";

import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  getActionsByCategory,
  isAuditAction,
  isAuditCategory,
  type AuditAction,
  type AuditCategory,
} from "@/lib/audit";

const ALL = "all";

type AuditFiltersProps = {
  category?: AuditCategory;
  action?: AuditAction;
  search: string;
  entity: { value: string; label: string } | null;
};

type FilterParams = {
  categoria?: string | null;
  acao?: string | null;
  q?: string | null;
  registro?: string | null;
};

export function AuditFilters({ category, action, search, entity }: AuditFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Qualquer mudança de filtro volta para a primeira página.
  function navigate(next: FilterParams) {
    const merged: FilterParams = {
      categoria: category ?? null,
      acao: action ?? null,
      q: search || null,
      registro: entity?.value ?? null,
      ...next,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/auditoria?${qs}` : "/auditoria", { scroll: false });
    });
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ q: value.trim() || null }), 300);
  }

  const actionOptions = category
    ? getActionsByCategory(category)
    : (Object.keys(AUDIT_ACTIONS) as AuditAction[]);
  const categoryItems = { [ALL]: "Todas as categorias", ...AUDIT_CATEGORIES };
  const actionItems = {
    [ALL]: "Todas as ações",
    ...Object.fromEntries(actionOptions.map((option) => [option, AUDIT_ACTIONS[option].label])),
  };
  const hasFilters = Boolean(category || action || search || entity);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <InputGroup className="sm:max-w-xs">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por ator ou alvo"
          aria-label="Buscar eventos"
        />
      </InputGroup>

      <Select
        items={categoryItems}
        value={category ?? ALL}
        onValueChange={(value) => {
          const next = isAuditCategory(value) ? value : null;
          const keepAction = next && action && AUDIT_ACTIONS[action].category === next;
          navigate({ categoria: next, acao: keepAction ? action : null });
        }}
      >
        <SelectTrigger className="sm:w-48" aria-label="Filtrar por categoria">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(categoryItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={actionItems}
        value={action ?? ALL}
        onValueChange={(value) => navigate({ acao: isAuditAction(value) ? value : null })}
      >
        <SelectTrigger className="sm:w-56" aria-label="Filtrar por ação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(actionItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {entity && (
        <span className="inline-flex h-10 items-center gap-1 rounded-md border bg-muted/40 pr-1.5 pl-3 text-xs">
          <span className="text-muted-foreground">Histórico de</span>
          <span className="max-w-48 truncate font-medium">{entity.label}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => navigate({ registro: null })}
            aria-label="Remover filtro de registro"
          >
            <XIcon />
          </Button>
        </span>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            navigate({ categoria: null, acao: null, q: null, registro: null });
          }}
        >
          Limpar filtros
        </Button>
      )}

      {isPending && (
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />
      )}
    </div>
  );
}
