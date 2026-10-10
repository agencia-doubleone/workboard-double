"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { WhiteboardJobOption, WhiteboardPersonView } from "./types";
import { EMPTY_WHITEBOARD, WhiteboardDialog } from "./whiteboard-dialog";

/** Abre o formulário de quadro novo; na página de um trabalho, já vem vinculado a ele (e coletivo). */
export function NewWhiteboardButton({
  people,
  jobs,
  job,
  variant = "default",
  size = "default",
  label = "Novo quadro",
}: {
  people: WhiteboardPersonView[];
  jobs: WhiteboardJobOption[];
  job?: WhiteboardJobOption;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = job ? { ...EMPTY_WHITEBOARD, access: "members" as const, jobId: job.id } : EMPTY_WHITEBOARD;
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        {label}
      </Button>
      <WhiteboardDialog
        open={open}
        onOpenChange={setOpen}
        initial={initial}
        people={people}
        jobs={job && !jobs.some((item) => item.id === job.id) ? [job, ...jobs] : jobs}
      />
    </>
  );
}
