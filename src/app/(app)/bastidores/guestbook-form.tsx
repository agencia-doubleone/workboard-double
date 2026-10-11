"use client";

import { Loader2Icon, PenLineIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { showAchievementToasts } from "@/components/achievements/achievement-toasts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { signGuestbook } from "./actions";

const MESSAGE_MAX = 140;

export function GuestbookForm({ signed, initialMessage }: { signed: boolean; initialMessage: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await signGuestbook({ message }).catch(() => null);
      if (!result?.ok) {
        setError(result?.fieldErrors?.message?.[0] ?? null);
        toast.error(result?.error ?? "Não foi possível assinar. Tente de novo.");
        return;
      }
      setError(null);
      if (result.unlocked.length > 0) showAchievementToasts(result.unlocked);
      else toast.success("Recado trocado.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={MESSAGE_MAX}
        rows={2}
        placeholder="Deixe um recado (opcional)"
        aria-label="Recado no livro de visitas"
        aria-invalid={Boolean(error)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {error ?? `${message.length}/${MESSAGE_MAX}`}
        </span>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PenLineIcon data-icon="inline-start" />}
          {signed ? "Trocar o recado" : "Assinar o livro"}
        </Button>
      </div>
    </form>
  );
}
