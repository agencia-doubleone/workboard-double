"use client";

import { useState } from "react";

import { matchMessageCommands, MESSAGE_EFFECTS, type MessageEffect } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * Sugestões de comandos ao digitar "/" no começo da mensagem (como as @menções):
 * setas escolhem, Enter ou Tab completam, Esc fecha. Com o comando já completo,
 * a lista some e o Enter envia normalmente.
 */
export function useSlashCommands(text: string, setText: (value: string) => void) {
  const [selection, setSelection] = useState({ text: "", index: 0 });
  // Esc esconde a lista até o texto mudar.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const candidates = dismissed === text ? [] : matchMessageCommands(text);
  const complete = candidates.length === 1 && `/${candidates[0]}` === text.toLowerCase();
  const open = candidates.length > 0 && !complete;
  const active = selection.text === text ? Math.min(selection.index, candidates.length - 1) : 0;

  function pick(command: MessageEffect) {
    setText(`/${command}`);
  }

  /** Trata as teclas da lista; true quando a tecla foi usada (o composer não deve enviar). */
  function handleKeyDown(event: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelection({ text, index: (active + step + candidates.length) % candidates.length });
      return true;
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      pick(candidates[active]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(text);
      return true;
    }
    return false;
  }

  return {
    open,
    candidates,
    active,
    setActive: (index: number) => setSelection({ text, index }),
    pick,
    handleKeyDown,
    /** Fecha a lista (ex.: o campo perdeu o foco). */
    dismiss: () => setDismissed(text),
  };
}

/** A lista de comandos, em cima do campo de mensagem. */
export function SlashCommandList({
  candidates,
  active,
  onHover,
  onPick,
  className,
}: {
  candidates: MessageEffect[];
  active: number;
  onHover: (index: number) => void;
  onPick: (command: MessageEffect) => void;
  className?: string;
}) {
  return (
    <div
      role="listbox"
      aria-label="Comandos"
      className={cn(
        "absolute bottom-full left-3 z-10 mb-1 w-72 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-overlay",
        className,
      )}
    >
      <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">Comandos</p>
      {candidates.map((command, index) => (
        <div
          key={command}
          role="option"
          aria-selected={index === active}
          onPointerMove={() => onHover(index)}
          onPointerDown={(event) => {
            // Não tira o foco do campo.
            event.preventDefault();
            onPick(command);
          }}
          className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm select-none aria-selected:bg-accent aria-selected:text-accent-foreground"
        >
          <span aria-hidden="true" className="text-base leading-none">
            {MESSAGE_EFFECTS[command].emoji}
          </span>
          <span className="font-mono text-[13px] font-medium">/{command}</span>
          <span className="truncate text-xs text-muted-foreground">{MESSAGE_EFFECTS[command].description}</span>
        </div>
      ))}
    </div>
  );
}
