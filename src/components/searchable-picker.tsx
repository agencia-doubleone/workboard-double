"use client";

import { CheckIcon, ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PickerOption = {
  value: string;
  label: string;
  /** Ícone ou avatar à esquerda do nome. */
  icon?: React.ReactNode;
};

type BaseProps = {
  id?: string;
  options: PickerOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Mostra um X para limpar a escolha (ex.: filtros). */
  clearable?: boolean;
};
type MultipleProps = BaseProps & { multiple: true; value: string[]; onChange: (value: string[]) => void };

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Seletor com busca, no visual dos inputs: escolha única (ex.: cliente) ou
 * várias (ex.: funcionários, com chips). Setas e Enter funcionam na lista.
 */
export function SearchablePicker(props: SingleProps | MultipleProps) {
  const {
    id,
    options,
    placeholder = "Selecione",
    searchPlaceholder = "Buscar...",
    emptyText = "Nada encontrado.",
    invalid,
    disabled,
    className,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return term ? options.filter((option) => normalize(option.label).includes(term)) : options;
  }, [options, query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(0);
    }
  }

  function toggle(value: string) {
    if (props.multiple) {
      props.onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
    } else {
      props.onChange(value);
      setOpen(false);
    }
  }

  function remove(value: string) {
    if (props.multiple) props.onChange(selected.filter((item) => item !== value));
    else props.onChange(null);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(Math.max(active + (event.key === "ArrowDown" ? 1 : -1), 0), filtered.length - 1);
      setActive(next);
      listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active];
      if (option) toggle(option.value);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        className={cn(
          "flex min-h-10 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-background py-1.5 pr-2 pl-3 text-left text-base shadow-control transition-[color,border-color,box-shadow] outline-none hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 data-popup-open:border-ring data-popup-open:ring-3 data-popup-open:ring-ring/20 md:text-sm dark:bg-input/30 dark:hover:border-foreground/25",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && <span className="truncate text-muted-foreground/80">{placeholder}</span>}
          {!props.multiple && selected[0] && (
            <span className="flex min-w-0 items-center gap-2">
              {byValue.get(selected[0])?.icon}
              <span className="truncate">{byValue.get(selected[0])?.label ?? "—"}</span>
            </span>
          )}
          {props.multiple &&
            selected.map((value) => (
              <span
                key={value}
                className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted pr-0.5 pl-1.5 text-xs font-medium"
              >
                {byValue.get(value)?.icon}
                <span className="truncate">{byValue.get(value)?.label ?? "Removido"}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remover ${byValue.get(value)?.label ?? ""}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    remove(value);
                  }}
                  className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </span>
              </span>
            ))}
        </span>
        {!props.multiple && props.clearable && selected[0] ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Limpar"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              remove(selected[0]);
            }}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </span>
        ) : (
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-64 gap-0 p-0" initialFocus={false}>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
          />
        </div>
        <div ref={listRef} role="listbox" aria-multiselectable={props.multiple || undefined} className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((option, index) => {
              const isSelected = selected.includes(option.value);
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  data-active={index === active || undefined}
                  onPointerMove={() => setActive(index)}
                  onClick={() => toggle(option.value)}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none data-active:bg-accent data-active:text-accent-foreground"
                >
                  {option.icon}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected && <CheckIcon className="size-4 shrink-0 text-primary-ink" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
