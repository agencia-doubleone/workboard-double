"use client";

import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

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
import { setClientArchived } from "./actions";

/** Arquivar ou reativar um cliente (reversível: confirmação simples, sem segurar). */
export function ArchiveClientDialog({
  open,
  onOpenChange,
  clientId,
  name,
  archived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  name: string;
  /** Situação atual: true reativa, false arquiva. */
  archived: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await setClientArchived({ clientId, archived: !archived });
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>{archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}</AlertDialogMedia>
          <AlertDialogTitle>{archived ? `Reativar ${name}?` : `Arquivar ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {archived
              ? "O cliente volta para a lista e fica visível para toda a equipe."
              : "O cliente sai da lista e fica oculto para a equipe. Cadastro, cofre e histórico continuam guardados, e dá para reativar a qualquer momento."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            {archived ? "Reativar" : "Arquivar"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
