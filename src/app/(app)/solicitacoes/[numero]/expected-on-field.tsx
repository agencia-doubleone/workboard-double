"use client";

import { Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import { setRequestExpectedOn } from "../actions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Previsão de entrega da solicitação (o cliente vê no portal). Salva sozinha
 * quando a data fica completa; o "x" do campo tira a previsão. Cada mudança entra no
 * andamento. Atrasada (passou da data sem encerrar), fica em vermelho.
 */
export function ExpectedOnField({ requestId, value, overdue = false }: { requestId: string; value: string | null; overdue?: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  const [saved, setSaved] = useState(value ?? "");
  const [serverValue, setServerValue] = useState(value);
  const [isPending, startTransition] = useTransition();
  // Mudou no servidor (outra aba, outro admin): mostra o novo valor.
  if (value !== serverValue) {
    setServerValue(value);
    setDraft(value ?? "");
    setSaved(value ?? "");
  }

  function save(next: string) {
    startTransition(async () => {
      const result = await setRequestExpectedOn({ requestId, expectedOn: next }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível salvar a previsão.");
        setDraft(saved);
        return;
      }
      setSaved(next);
      toast.success(result.message);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
      <div className={cn("w-44", overdue && draft === saved && "[&_input]:font-medium [&_input]:text-destructive-ink")}>
        <DatePicker
          id="request-expected-on"
          value={draft}
          onChange={(next) => {
            setDraft(next);
            if ((next === "" || ISO_DATE.test(next)) && next !== saved) save(next);
          }}
          disabled={isPending}
          placeholder="Sem previsão"
        />
      </div>
    </div>
  );
}
