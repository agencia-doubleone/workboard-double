"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { JobStatusBadge } from "@/components/job-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { setJobStatus } from "./actions";
import type { JobStatusOption } from "./types";

/** Status do trabalho como selo clicável: escolher outro já salva. */
export function StatusSelect({
  jobId,
  value,
  statuses,
  compact = false,
  className,
}: {
  jobId: string;
  value: string;
  statuses: JobStatusOption[];
  /** Sem a setinha (na tabela, onde falta espaço). */
  compact?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  const current = statuses.find((status) => status.id === optimistic);
  const items = Object.fromEntries(statuses.map((status) => [status.id, status.name]));

  function handleChange(next: string | null) {
    if (!next || next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setJobStatus({ jobId, statusId: next });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
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
        {current ? (
          <JobStatusBadge name={current.name} textColor={current.textColor} backgroundColor={current.backgroundColor} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="min-w-48">
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <JobStatusBadge name={status.name} textColor={status.textColor} backgroundColor={status.backgroundColor} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
