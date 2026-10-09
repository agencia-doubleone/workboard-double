"use client";

import { FileTextIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { JobStatusBadge } from "@/components/job-status-badge";
import { RichTextContent } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { getJobBriefing, getJobStatusHistory, setJobActive } from "./actions";
import type { JobPersonView } from "./types";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** Avatares dos funcionários (até `max`, depois "+N"); com uma pessoa só, mostra o nome. */
export function AssigneeAvatars({ people, max = 3 }: { people: JobPersonView[]; max?: number }) {
  if (people.length === 0) return <span className="text-muted-foreground">—</span>;
  if (people.length === 1) {
    const [person] = people;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-6 text-[10px]" />
        <span className="truncate">{person.name}</span>
      </span>
    );
  }
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <Hint label={people.map((person) => person.name).join(", ")}>
      <span className="flex items-center gap-1">
        {shown.map((person) => (
          <UserAvatar key={person.id} name={person.name} imageUrl={person.imageUrl} className="size-6 text-[10px]" />
        ))}
        {rest > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[10px] font-semibold text-muted-foreground">
            +{rest}
          </span>
        )}
      </span>
    </Hint>
  );
}

/** Ativo/inativo: desligar tira o trabalho da lista "Em aberto" sem mexer no status. */
export function ActiveSwitch({ jobId, active, label }: { jobId: string; active: boolean; label: string }) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(active);

  function handleChange(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setJobActive({ jobId, active: next });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <Switch
      checked={optimistic}
      onCheckedChange={handleChange}
      disabled={isPending}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

/** Ícone do briefing: abre um modal com o texto completo (carregado ao abrir). */
export function BriefingButton({ jobId, title, hasBriefing }: { jobId: string; title: string; hasBriefing: boolean }) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    startTransition(async () => {
      const result = await getJobBriefing({ jobId });
      setHtml(result?.html ?? null);
    });
  }

  return (
    <>
      <Hint label={hasBriefing ? "Ver briefing" : "Sem briefing"}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ver briefing"
          disabled={!hasBriefing}
          onClick={(event) => {
            event.stopPropagation();
            handleOpen();
          }}
          className={cn(!hasBriefing && "opacity-40")}
        >
          <FileTextIcon />
        </Button>
      </Hint>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Briefing</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {isPending || html === undefined ? (
              <div className="flex justify-center py-10">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : html ? (
              <RichTextContent html={html} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum briefing.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type HistoryItem = NonNullable<Awaited<ReturnType<typeof getJobStatusHistory>>>[number];

/** Histórico de status do trabalho, num popover (carregado ao abrir). */
export function StatusHistoryButton({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (!open) return;
    startTransition(async () => {
      setItems((await getJobStatusHistory({ jobId })) ?? []);
    });
  }

  return (
    <Popover onOpenChange={handleOpenChange}>
      <Hint label="Histórico de status">
        <PopoverTrigger
          aria-label="Histórico de status"
          onClick={(event) => event.stopPropagation()}
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <HistoryIcon />
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80 gap-3" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-medium">Histórico de status</p>
        {isPending || items === null ? (
          <div className="flex justify-center py-4">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <StatusTimeline items={items} />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Linha do tempo de status (mais recente em cima). */
export function StatusTimeline({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem registros.</p>;
  return (
    <ol className="flex max-h-80 flex-col gap-3 overflow-y-auto">
      {items.map((item, index) => (
        <li key={item.id} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn("mt-2 size-2 shrink-0 rounded-full", index === 0 ? "bg-primary" : "bg-border")}
          />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <JobStatusBadge name={item.statusName} textColor={item.textColor} backgroundColor={item.backgroundColor} />
            <span className="text-xs text-muted-foreground">
              {item.changedByName ?? "Alguém"} · {dateTime.format(new Date(item.changedAt))}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
