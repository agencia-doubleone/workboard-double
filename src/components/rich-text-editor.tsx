"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";
import type { RichTextEditorProps } from "./rich-text-editor-impl";

// Editor de texto rico (Tiptap): títulos, fonte, tamanho, negrito/itálico/
// sublinhado/riscado, cor, marca-texto, alinhamento, listas, citação, links e
// imagens (com onUploadImage). Ao colar de fora (Word, Google Docs, sites), a
// formatação externa cai sozinha. O servidor ainda limpa o HTML antes de
// salvar (sanitizeRichText em src/server/rich-text.ts, com imageOrigin = CDN).
// Para exibir, use <RichTextContent>.
//
// Carregado só no navegador: o Tiptap sorteia ids durante a renderização (o
// prerender do Next recusa) e fica fora do JavaScript inicial da página.
export const RichTextEditor = dynamic<RichTextEditorProps>(() => import("./rich-text-editor-impl"), {
  ssr: false,
  loading: () => <RichTextEditorSkeleton />,
});

/** Mesmo tamanho do editor montado, para a página não pular ao carregar. */
function RichTextEditorSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-md border border-input bg-background shadow-control dark:bg-input/30">
      <div className="h-[37px] border-b bg-muted/40 dark:bg-transparent" />
      <div className="min-h-48" />
    </div>
  );
}

/** HTML já limpo no servidor (sanitizeRichText), com a mesma tipografia do editor. */
export function RichTextContent({ html, className }: { html: string; className?: string }) {
  return <div className={cn("rich-text", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
