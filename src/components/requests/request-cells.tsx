"use client";

import { MessageSquareIcon } from "lucide-react";
import Link from "next/link";

import { Hint } from "@/components/hint";
import { cn } from "@/lib/utils";
import type { RequestRowView } from "./types";

// Células das listas de solicitações, iguais na equipe e no portal.

/** Previsão de entrega: "15/10" (em vermelho se atrasada), com a data completa na dica. */
export function ExpectedOnCell({ value, overdue = false }: { value: RequestRowView["expectedOn"]; overdue?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Hint label={overdue ? `Atrasada: previsão de entrega em ${value.full}` : `Previsão de entrega: ${value.full}`}>
      <span className={cn(overdue && "font-medium text-destructive-ink")}>{value.label}</span>
    </Hint>
  );
}

/** Mensagens: total, e as não lidas em destaque. */
export function MessagesCountLink({ href, messages }: { href: string; messages: RequestRowView["messages"] }) {
  const { total, unread } = messages;
  const label =
    total === 0
      ? "Nenhuma mensagem"
      : unread > 0
        ? `${unread} não ${unread === 1 ? "lida" : "lidas"} de ${total}`
        : `${total} ${total === 1 ? "mensagem" : "mensagens"}`;
  return (
    <Hint label={label}>
      <Link
        href={href}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
          total === 0 && "text-muted-foreground/70",
        )}
      >
        <MessageSquareIcon className="size-3.5" />
        {total}
        {unread > 0 && (
          <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread}
          </span>
        )}
      </Link>
    </Hint>
  );
}
