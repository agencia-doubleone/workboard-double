"use client";

import { CheckIcon, CopyIcon, FolderIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { splitMessageText } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * Texto de mensagem: endereços http(s) viram links e caminhos de pasta do drive
 * ("G:\Drives compartilhados\...") ganham um botão para copiar (o navegador não
 * abre pastas do computador; copiado, é só colar no Explorador de Arquivos).
 */
export function Linkified({ text, onPrimary = false }: { text: string; /** No balão na cor de destaque. */ onPrimary?: boolean }) {
  return splitMessageText(text).map((token, index) => {
    if (token.type === "text") return <Fragment key={index}>{token.text}</Fragment>;
    if (token.type === "url") {
      return (
        <a
          key={index}
          href={token.url}
          target="_blank"
          rel="noopener noreferrer"
          // No balão na cor de destaque, o link fica na cor do texto (sublinhado).
          className={cn("break-all underline underline-offset-2", !onPrimary && "text-primary-ink")}
        >
          {token.url}
        </a>
      );
    }
    return <FolderPath key={index} path={token.path} onPrimary={onPrimary} />;
  });
}

function FolderPath({ path, onPrimary }: { path: string; onPrimary: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      toast.success("Caminho copiado. Cole no Explorador de Arquivos.");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <span
      // Sem espaço (balão estreito, celular), o botão desce para a linha de baixo.
      className={cn(
        "my-0.5 inline-flex max-w-full flex-wrap items-start gap-x-1.5 gap-y-1 rounded-md border py-0.5 pr-0.5 pl-1.5 align-middle text-[13px] leading-snug whitespace-normal",
        onPrimary ? "border-primary-foreground/30 bg-primary-foreground/10" : "bg-background",
      )}
    >
      <span className="flex min-w-[min(100%,14rem)] flex-1 items-start gap-1.5">
        <FolderIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 font-mono text-[12px] break-all">{path}</span>
      </span>
      <button
        type="button"
        onClick={copy}
        title="Copiar o caminho da pasta"
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-px text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          onPrimary ? "bg-primary-foreground/15 hover:bg-primary-foreground/25" : "bg-muted text-foreground hover:bg-accent",
        )}
      >
        {copied ? <CheckIcon aria-hidden="true" className="size-3" /> : <CopyIcon aria-hidden="true" className="size-3" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
