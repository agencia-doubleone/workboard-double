"use client";

import { FileTextIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { Hint } from "@/components/hint";
import { RichTextContent } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RequestTimeline } from "./request-timeline";
import type { RequestTimelineItemView } from "./types";

// Botões das listas de solicitações, como os da planilha de trabalhos: o
// briefing num modal e o andamento num popover, carregados só ao abrir. Cada
// lado passa a própria Server Action (`load`): a da equipe ou a do portal,
// que só acha as solicitações do cliente do contato.

/** Briefing da solicitação num modal (carregado ao abrir). */
export function RequestBriefingButton({
  requestId,
  title,
  hasBriefing,
  load,
}: {
  requestId: string;
  /** "S-12 Assunto", no topo do modal. */
  title: string;
  hasBriefing: boolean;
  load: (input: { requestId: string }) => Promise<{ html: string } | null>;
}) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    startTransition(async () => {
      const result = await load({ requestId }).catch(() => null);
      setHtml(result?.html || null);
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

/** Andamento da solicitação (status, previsão e edições) num popover, carregado ao abrir. */
export function RequestHistoryButton({
  requestId,
  load,
  teamLabel,
}: {
  requestId: string;
  load: (input: { requestId: string }) => Promise<RequestTimelineItemView[] | null>;
  /** No portal, "Double One" ao lado de quem é da agência. */
  teamLabel?: string;
}) {
  const [items, setItems] = useState<RequestTimelineItemView[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (!open) return;
    startTransition(async () => {
      setItems((await load({ requestId }).catch(() => null)) ?? []);
    });
  }

  return (
    <Popover onOpenChange={handleOpenChange}>
      <Hint label="Andamento">
        <PopoverTrigger
          aria-label="Andamento"
          onClick={(event) => event.stopPropagation()}
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <HistoryIcon />
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80 gap-3" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-medium">Andamento</p>
        {isPending || items === null ? (
          <div className="flex justify-center py-4">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto pr-1">
            <RequestTimeline items={items} teamLabel={teamLabel} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
