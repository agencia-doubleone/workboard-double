"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { DeleteJobDialog } from "../delete-job-dialog";

/** Editar (toda a equipe) e excluir (só admins) na página do trabalho. */
export function JobActions({ job, isAdmin }: { job: { id: string; pit: number; name: string }; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex shrink-0 gap-2">
      {isAdmin && (
        <Button variant="outline" onClick={() => setOpen(true)} className="text-destructive-ink">
          <Trash2Icon data-icon="inline-start" />
          Excluir
        </Button>
      )}
      <Link href={`/trabalhos/${job.pit}/editar`} className={buttonVariants()}>
        <PencilIcon data-icon="inline-start" />
        Editar
      </Link>
      {isAdmin && <DeleteJobDialog open={open} onOpenChange={setOpen} job={job} redirectTo="/trabalhos" />}
    </div>
  );
}
