"use client";

import { BriefcaseIcon, LinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Hint } from "@/components/hint";
import { Button, buttonVariants } from "@/components/ui/button";
import { copyPortalRequestLink } from "../copy-portal-link";
import { DeleteRequestDialog } from "../delete-request-dialog";

/** Copiar o link do portal, excluir, criar um trabalho e editar, na página da solicitação. */
export function RequestActions({ request }: { request: { id: string; number: number; title: string } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Hint label="Copiar o link do portal, para mandar ao cliente">
        <Button variant="outline" size="icon" aria-label="Copiar o link do portal" onClick={() => copyPortalRequestLink(request.number)}>
          <LinkIcon />
        </Button>
      </Hint>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-destructive-ink">
        <Trash2Icon data-icon="inline-start" />
        Excluir
      </Button>
      <Hint label="Um trabalho interno da agência, vinculado a esta solicitação (o cliente não vê)">
        <Link href={`/trabalhos/novo?solicitacao=${request.number}`} className={buttonVariants({ variant: "outline" })}>
          <BriefcaseIcon data-icon="inline-start" />
          Criar trabalho
        </Link>
      </Hint>
      <Link href={`/solicitacoes/${request.number}/editar`} className={buttonVariants()}>
        <PencilIcon data-icon="inline-start" />
        Editar
      </Link>
      <DeleteRequestDialog open={open} onOpenChange={setOpen} request={request} redirectTo="/solicitacoes" />
    </div>
  );
}
