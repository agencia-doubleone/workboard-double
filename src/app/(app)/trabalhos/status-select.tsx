"use client";

import { BanIcon } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { celebrate, isCompletion } from "@/components/celebration";
import { Hint } from "@/components/hint";
import { JobStatusBadge } from "@/components/job-status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { selectableStatuses } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { setJobStatus } from "./actions";
import type { JobStatusOption } from "./types";

/**
 * Status do trabalho como selo clicável: escolher outro já salva. Cancelar pede
 * confirmação (o trabalho some da planilha) e é só de admins: para os outros, os
 * status de cancelamento não aparecem e um trabalho cancelado fica com o selo parado.
 */
export function StatusSelect({
  jobId,
  jobLabel,
  value,
  statuses,
  isAdmin,
  compact = false,
  className,
}: {
  jobId: string;
  /** "#123 Nome do trabalho", para a confirmação de cancelar. */
  jobLabel: string;
  value: string;
  statuses: JobStatusOption[];
  isAdmin: boolean;
  /** Sem a setinha (na tabela, onde falta espaço). */
  compact?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  // Status de cancelamento escolhido, esperando a confirmação.
  const [confirming, setConfirming] = useState<JobStatusOption | null>(null);
  const current = statuses.find((status) => status.id === optimistic);
  const options = selectableStatuses(statuses, value, isAdmin);
  const items = Object.fromEntries(statuses.map((status) => [status.id, status.name]));

  function save(next: string) {
    const before = statuses.find((status) => status.id === optimistic);
    const after = statuses.find((status) => status.id === next);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setJobStatus({ jobId, statusId: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      if (isCompletion(before, after)) celebrate();
    });
  }

  function handleChange(next: string | null) {
    if (!next || next === optimistic) return;
    const after = statuses.find((status) => status.id === next);
    if (after?.isCanceled) setConfirming(after);
    else save(next);
  }

  const badge = current ? (
    <JobStatusBadge name={current.name} textColor={current.textColor} backgroundColor={current.backgroundColor} />
  ) : (
    <span className="text-muted-foreground">—</span>
  );

  if (current?.isCanceled && options.length <= 1) {
    return (
      <Hint label="Só um admin tira o trabalho de cancelado">
        <span tabIndex={0} className={cn("inline-flex h-8 max-w-full items-center px-1 outline-none", className)}>
          {badge}
        </span>
      </Hint>
    );
  }

  return (
    <>
      <Select items={items} value={optimistic} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger
          size="sm"
          aria-label="Status"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "h-8 max-w-full cursor-pointer gap-1 border-transparent bg-transparent px-1 shadow-none hover:bg-muted dark:bg-transparent",
            compact && "[&>svg:last-child]:hidden",
            className,
          )}
        >
          {badge}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="min-w-48">
          {options.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              <JobStatusBadge name={status.name} textColor={status.textColor} backgroundColor={status.backgroundColor} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <BanIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Cancelar {jobLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              O trabalho sai da planilha de todo mundo, do calendário e dos relatórios, e passa a aparecer só em
              “Cancelados”. Para desfazer, é só escolher outro status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                if (confirming) save(confirming.id);
                setConfirming(null);
              }}
            >
              Cancelar trabalho
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
