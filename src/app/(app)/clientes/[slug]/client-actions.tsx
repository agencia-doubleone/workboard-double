"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ArchiveClientDialog } from "../archive-client-dialog";

/** Editar e arquivar/reativar na página do cliente (só admins). */
export function ClientActions({
  clientId,
  slug,
  name,
  archived,
}: {
  clientId: string;
  slug: string;
  name: string;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex shrink-0 gap-2">
      {archived ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <ArchiveRestoreIcon data-icon="inline-start" />
          Reativar
        </Button>
      ) : (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <ArchiveIcon data-icon="inline-start" />
            Arquivar
          </Button>
          <Link href={`/clientes/${slug}/editar`} className={buttonVariants()}>
            <PencilIcon data-icon="inline-start" />
            Editar
          </Link>
        </>
      )}
      <ArchiveClientDialog open={open} onOpenChange={setOpen} clientId={clientId} name={name} archived={archived} />
    </div>
  );
}
