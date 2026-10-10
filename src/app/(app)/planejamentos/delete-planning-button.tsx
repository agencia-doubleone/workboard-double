"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
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
import { deletePlanning } from "./actions";

/** Só admins: exclui o planejamento inteiro (todos os meses e posts). */
export function DeletePlanningButton({ planningId, clientName }: { planningId: string; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deletePlanning({ planningId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.push("/planejamentos");
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2Icon data-icon="inline-start" />
        Excluir planejamento
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Excluir o planejamento de {clientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os meses, posts e documentos guardados saem de vez. O cliente continua cadastrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <HoldToConfirmButton
              label="Segure para excluir"
              pendingLabel="Excluindo..."
              icon={<Trash2Icon />}
              pending={isPending}
              onConfirm={handleConfirm}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
