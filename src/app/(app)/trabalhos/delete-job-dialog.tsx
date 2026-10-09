"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
import { deleteJob } from "./actions";

/** Exclusão definitiva de um trabalho (só admins). Na página do trabalho, volta para a lista. */
export function DeleteJobDialog({
  open,
  onOpenChange,
  job,
  redirectTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: { id: string; pit: number; name: string };
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteJob({ jobId: job.id });
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
        if (redirectTo) router.replace(redirectTo);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Excluir #{job.pit} {job.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            O trabalho sai de vez, com briefing, histórico de status, mensagens e anexos. O PIT não é reaproveitado.
            Para só tirar da lista, desative o trabalho.
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
  );
}
