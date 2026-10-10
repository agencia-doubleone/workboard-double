"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { celebrate } from "@/components/celebration";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  isPlanningCompletion,
  isPlanningStatus,
  PLANNING_STATUSES,
  PLANNING_STATUS_KEYS,
  type PlanningStatus,
} from "@/lib/planning";
import { cn } from "@/lib/utils";

/** Status como selo clicável: escolher outro já salva (mês ou post). */
export function PlanningStatusSelect({
  value,
  onSave,
  label,
  celebrateDone = false,
  className,
}: {
  value: PlanningStatus;
  /** Server Action que salva o status novo. */
  onSave: (status: PlanningStatus) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  /** Rótulo para leitores de tela (ex.: "Status do mês"). */
  label: string;
  /** Comemora (confetes e som) ao passar para "Finalizado". Só no mês: post a post seria demais. */
  celebrateDone?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const items = Object.fromEntries(PLANNING_STATUS_KEYS.map((status) => [status, PLANNING_STATUSES[status].label]));
  const current = PLANNING_STATUSES[optimistic];

  return (
    <Select
      items={items}
      value={optimistic}
      disabled={isPending}
      onValueChange={(next) => {
        if (!isPlanningStatus(next) || next === optimistic) return;
        const before = optimistic;
        startTransition(async () => {
          setOptimistic(next);
          const result = await onSave(next).catch(() => null);
          if (!result?.ok) {
            toast.error(result?.error ?? "Não foi possível mudar o status.");
            return;
          }
          toast.success(result.message);
          if (celebrateDone && isPlanningCompletion(before, next)) celebrate();
        });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn(
          "h-8 w-fit cursor-pointer gap-1 border-transparent bg-transparent px-1 shadow-none hover:bg-muted dark:bg-transparent",
          className,
        )}
      >
        <Badge variant={current.badge}>{current.label}</Badge>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="min-w-52">
        {PLANNING_STATUS_KEYS.map((status) => (
          <SelectItem key={status} value={status}>
            <Badge variant={PLANNING_STATUSES[status].badge}>{PLANNING_STATUSES[status].label}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
