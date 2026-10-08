"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HoldToConfirmButtonProps = {
  onConfirm: () => void;
  label: string;
  pendingLabel?: string;
  icon?: React.ReactNode;
  /** Tempo segurando até confirmar, em ms. */
  duration?: number;
  pending?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Botão destrutivo que só confirma depois de mantido pressionado (mouse,
 * toque ou Espaço/Enter). Soltar antes do fim cancela. A faixa sólida é
 * revelada da esquerda para a direita conforme o tempo passa.
 */
export function HoldToConfirmButton({
  onConfirm,
  label,
  pendingLabel = "Processando...",
  icon,
  duration = 1500,
  pending = false,
  disabled = false,
  className,
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hintId = useId();
  const inactive = disabled || pending;

  useEffect(() => () => clearTimeout(timer.current), []);

  function start() {
    if (inactive || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onConfirm();
    }, duration);
  }

  function cancel() {
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  }

  const content = (
    <>
      {pending ? <Loader2Icon className="animate-spin" /> : icon}
      {pending ? pendingLabel : label}
    </>
  );

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={inactive}
      aria-describedby={hintId}
      className={cn("relative touch-none overflow-hidden select-none", className)}
      onPointerDown={(event) => {
        if (event.button === 0) start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") cancel();
      }}
      onBlur={cancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {content}
      <span
        aria-hidden="true"
        data-holding={holding || undefined}
        className="absolute inset-0 flex items-center justify-center gap-1.5 bg-destructive text-background [clip-path:inset(0_100%_0_0)] transition-[clip-path] duration-200 ease-out data-holding:[clip-path:inset(0_0_0_0)] data-holding:ease-linear [&_svg]:size-4"
        style={holding ? { transitionDuration: `${duration}ms` } : undefined}
      >
        {content}
      </span>
      <span id={hintId} className="sr-only">
        Mantenha pressionado para confirmar.
      </span>
    </Button>
  );
}
