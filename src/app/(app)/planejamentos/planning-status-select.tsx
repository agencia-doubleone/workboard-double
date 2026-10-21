"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { celebrate } from "@/components/celebration";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  isPlanningCompletion,
  isPlanningStatus,
  parsePostStatusValue,
  PLANNING_STATUSES,
  PLANNING_STATUS_KEYS,
  postStatusLabel,
  type PlanningStatus,
  type PostStatusValue,
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

/**
 * O status do post. Nos planejamentos com "Aprovar pauta", os status de
 * andamento vêm com a etapa ("Pauta · Aguardando aprovação"); `options` diz
 * quais aparecem (quem não é admin não troca de etapa).
 */
export function PostStatusSelect({
  value,
  options,
  onSave,
}: {
  value: PostStatusValue;
  options: readonly PostStatusValue[];
  onSave: (value: PostStatusValue) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const items = Object.fromEntries(options.map((option) => [option, postStatusLabel(option).label]));
  const current = postStatusLabel(optimistic);

  return (
    <Select
      items={items}
      value={optimistic}
      disabled={isPending}
      onValueChange={(next) => {
        if (typeof next !== "string" || next === optimistic || !parsePostStatusValue(next)) return;
        startTransition(async () => {
          setOptimistic(next as PostStatusValue);
          const result = await onSave(next as PostStatusValue).catch(() => null);
          if (!result?.ok) {
            toast.error(result?.error ?? "Não foi possível mudar o status.");
            return;
          }
          toast.success(result.message);
        });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Status do post"
        className="h-8 w-fit cursor-pointer gap-1 border-transparent bg-transparent px-1 shadow-none hover:bg-muted dark:bg-transparent"
      >
        <Badge variant={current.badge}>{current.label}</Badge>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end" className="min-w-60">
        {options.map((option) => {
          const shown = postStatusLabel(option);
          return (
            <SelectItem key={option} value={option}>
              <Badge variant={shown.badge}>{shown.label}</Badge>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
