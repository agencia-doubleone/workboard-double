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
import { requestCode } from "@/lib/client-requests";
import { deleteClientRequest } from "./actions";

/** Exclusão definitiva de uma solicitação (some também do portal). Na página dela, volta para a lista. */
export function DeleteRequestDialog({
  open,
  onOpenChange,
  request,
  redirectTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: { id: string; number: number; title: string };
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteClientRequest({ requestId: request.id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível excluir. Tente de novo.");
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
      if (redirectTo) router.replace(redirectTo);
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
            Excluir {requestCode(request.number)} {request.title}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            A solicitação sai de vez, também do portal do cliente, com briefing, andamento, conversa e anexos. O número
            não é reaproveitado. Os trabalhos criados a partir dela continuam, sem o vínculo. Para encerrar sem apagar, mude o
            status para Cancelada ou Negada.
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
