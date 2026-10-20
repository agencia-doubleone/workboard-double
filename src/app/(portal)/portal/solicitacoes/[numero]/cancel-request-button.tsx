"use client";

import { BanIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cancelPortalRequest } from "../actions";

/** Cancelar a própria solicitação (só enquanto "Aguardando análise"). É reversível pela equipe: confirmação simples. */
export function CancelRequestButton({ requestId, code }: { requestId: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await cancelPortalRequest({ requestId }).catch(() => null);
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.error(result?.error ?? "Não foi possível cancelar.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" />}>
        <BanIcon data-icon="inline-start" />
        Cancelar solicitação
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <BanIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Cancelar a {code}?</AlertDialogTitle>
          <AlertDialogDescription>
            A Double One para de analisar o pedido. A solicitação e a conversa continuam aqui, em “Encerradas”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Cancelar solicitação
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
