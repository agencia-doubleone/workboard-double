"use client";

import { EllipsisIcon, ExternalLinkIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteWhiteboard } from "./actions";

/** Menu "…" do card na lista: abrir em outra aba e excluir (para quem pode). */
export function WhiteboardCardMenu({ id, title, className }: { id: string; title: string; className?: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWhiteboard({ whiteboardId: id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível excluir o quadro.");
        return;
      }
      toast.success(result.message);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Ações do quadro ${title}`}
              className={cn("bg-background/90 text-muted-foreground shadow-none", className)}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/quadros/${id}`} target="_blank" rel="noopener" />}>
            <ExternalLinkIcon />
            Abrir em outra aba
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2Icon />
            Excluir quadro
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !isPending && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Excluir o quadro “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O desenho sai de vez, para todo mundo que tem acesso. Quem estiver com ele aberto é avisado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <HoldToConfirmButton
              label="Segure para excluir"
              pendingLabel="Excluindo..."
              icon={<Trash2Icon />}
              pending={isPending}
              onConfirm={handleDelete}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
