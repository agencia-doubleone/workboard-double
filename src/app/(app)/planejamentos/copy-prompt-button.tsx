"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { MonthKey } from "@/lib/calendar";
import { planningPrompt } from "@/lib/planning-prompt";

/**
 * Copia o prompt padrão que converte o planejamento do Word no JSON de
 * importação (com o mês no fim, para a IA acertar o ano das datas).
 */
export function CopyPromptButton({
  month,
  variant = "outline",
  className,
}: {
  month: MonthKey;
  variant?: "outline" | "ghost" | "soft";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(planningPrompt(month));
      setCopied(true);
      toast.success("Prompt copiado. Cole numa IA junto com o planejamento do Word.");
    } catch {
      toast.error("Não foi possível copiar o prompt.");
    }
  }

  return (
    <Button type="button" variant={variant} onClick={copy} className={className}>
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      Copiar prompt
    </Button>
  );
}
