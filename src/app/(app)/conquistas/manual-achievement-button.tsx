"use client";

import { BugIcon, Loader2Icon } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AchievementId } from "@/lib/achievements";
import { setManualAchievement } from "./actions";

/** Admin concede (ou retira, com confirmação) uma conquista manual na página da pessoa. */
export function ManualAchievementButton({
  userId,
  personName,
  achievementId,
  achievementName,
  granted,
}: {
  userId: string;
  personName: string;
  achievementId: AchievementId;
  achievementName: string;
  granted: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(next: boolean) {
    startTransition(async () => {
      const result = await setManualAchievement({ userId, achievementId, granted: next }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível salvar. Tente de novo.");
        return;
      }
      toast.success(result.message);
      setConfirmOpen(false);
    });
  }

  if (!granted) {
    return (
      <Button variant="soft" size="xs" disabled={isPending} onClick={() => submit(true)}>
        {isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
        Conceder
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setConfirmOpen(true)}>
        Retirar
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={(next) => !isPending && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <BugIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Retirar “{achievementName}” de {personName}?</AlertDialogTitle>
            <AlertDialogDescription>Dá para conceder de novo depois.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={isPending} onClick={() => submit(false)}>
              {isPending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Retirar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
