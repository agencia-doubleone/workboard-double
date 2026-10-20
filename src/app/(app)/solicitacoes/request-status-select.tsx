"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { celebrate } from "@/components/celebration";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  isRequestCompletion,
  isRequestStatus,
  REQUEST_STATUSES,
  REQUEST_STATUS_KEYS,
  type RequestStatus,
} from "@/lib/client-requests";
import { cn } from "@/lib/utils";
import { setRequestStatus } from "./actions";

const ITEMS = Object.fromEntries(REQUEST_STATUS_KEYS.map((status) => [status, REQUEST_STATUSES[status].label]));

/**
 * Status da solicitação como selo clicável: escolher outro já salva (e o
 * cliente vê no portal). Finalizar comemora na tela de quem marcou.
 */
export function RequestStatusSelect({
  requestId,
  requestLabel,
  value,
  className,
}: {
  requestId: string;
  /** "S-12 Assunto", para leitores de tela. */
  requestLabel: string;
  value: RequestStatus;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);

  return (
    <Select
      items={ITEMS}
      value={optimistic}
      disabled={isPending}
      onValueChange={(next) => {
        if (!isRequestStatus(next) || next === optimistic) return;
        const before = optimistic;
        startTransition(async () => {
          setOptimistic(next);
          const result = await setRequestStatus({ requestId, status: next }).catch(() => null);
          if (!result?.ok) {
            toast.error(result?.error ?? "Não foi possível mudar o status.");
            return;
          }
          toast.success(result.message);
          if (isRequestCompletion(before, next)) celebrate();
        });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status de ${requestLabel}`}
        className={cn(
          "h-8 w-fit cursor-pointer gap-1 border-transparent bg-transparent px-1 shadow-none hover:bg-muted dark:bg-transparent",
          className,
        )}
      >
        <RequestStatusBadge status={optimistic} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="min-w-52">
        {REQUEST_STATUS_KEYS.map((status) => (
          <SelectItem key={status} value={status}>
            <RequestStatusBadge status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
