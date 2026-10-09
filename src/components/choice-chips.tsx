"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ChoiceChipsProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  /** Valores marcados (múltipla escolha). */
  value: readonly T[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
  /** Rótulo do grupo para leitores de tela (o visível vem do FieldLabel). */
  "aria-labelledby"?: string;
  className?: string;
};

/** Botões que ligam e desligam opções, para múltipla escolha curta (ex.: classe social). */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
  ...props
}: ChoiceChipsProps<T>) {
  function toggle(option: T) {
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : options.map((item) => item.value).filter((item) => item === option || value.includes(item)),
    );
  }

  return (
    <div role="group" className={cn("flex flex-wrap gap-2", className)} {...props}>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(option.value)}
            className="inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground shadow-control transition-colors outline-none hover:border-foreground/20 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-primary/40 aria-pressed:bg-primary-soft aria-pressed:text-primary-ink dark:bg-input/30 dark:aria-pressed:bg-primary-soft"
          >
            {selected && <CheckIcon className="-ml-0.5 size-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
