"use client";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type HintProps = {
  label: React.ReactNode;
  /** Teclas do atalho, ex.: ["Ctrl", "B"]. */
  shortcut?: string[];
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  disabled?: boolean;
  /** Elemento que dispara o tooltip; precisa repassar ref e props. */
  children: React.ReactElement;
};

export function Hint({
  label,
  shortcut,
  side = "top",
  sideOffset,
  disabled,
  children,
}: HintProps) {
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} sideOffset={sideOffset}>
        {label}
        {shortcut && (
          <KbdGroup>
            {shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
