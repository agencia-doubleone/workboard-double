"use client";

import { AlertTriangleIcon, ArrowLeftIcon, ClipboardPasteIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCompactDay } from "@/lib/calendar";
import { formatKind, PLANNING_LIMITS, type SocialNetwork } from "@/lib/planning";
import { parsePlanningDocument, type ParsedPlanning } from "@/lib/planning-import";
import { cn } from "@/lib/utils";
import { importPosts } from "./actions";
import { FORMAT_ICONS } from "./planning-ui";

/** Cola o planejamento do Word, mostra os posts separados e importa os escolhidos. */
export function ImportDialog({
  open,
  onOpenChange,
  planningId,
  month,
  monthLabel,
  existingPosts,
  hasConcept,
  defaultNetwork,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningId: string;
  month: string;
  monthLabel: string;
  /** Quantos posts o mês já tem (para escolher entre adicionar e substituir). */
  existingPosts: number;
  hasConcept: boolean;
  defaultNetwork: SocialNetwork | null;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedPlanning | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setText("");
    setParsed(null);
    setExcluded(new Set());
    setMode("append");
  }

  function read() {
    setParsed(parsePlanningDocument(text, month));
    setExcluded(new Set());
  }

  const chosen = parsed ? parsed.posts.filter((_, index) => !excluded.has(index)) : [];

  function save() {
    if (!parsed) return;
    startTransition(async () => {
      const result = await importPosts({
        planningId,
        month,
        document: text.trim(),
        concept: parsed.concept ?? "",
        mode,
        posts: chosen.map((post) => ({
          date: post.date,
          network: defaultNetwork,
          format: post.format ?? "",
          topic: post.topic ?? "",
          headline: post.headline.slice(0, PLANNING_LIMITS.headline),
          copy: post.copy.slice(0, PLANNING_LIMITS.copy),
          sections: post.sections.slice(0, PLANNING_LIMITS.sections).map((section) => ({
            label: section.label.slice(0, PLANNING_LIMITS.sectionLabel),
            text: section.text.slice(0, PLANNING_LIMITS.sectionText),
          })),
        })),
      }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível importar.");
        return;
      }
      toast.success(result.message);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Colar do Word: {monthLabel}</DialogTitle>
          <DialogDescription>
            {parsed
              ? "Confira os posts separados. Desmarque o que não quer importar; depois dá para editar cada um."
              : "Abra o documento do planejamento, selecione tudo (Ctrl+A), copie e cole aqui. Os posts são separados pelos cabeçalhos (ex.: \"01 — 02/09 | TEMA\")."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-5 min-h-0 overflow-y-auto px-5">
          {!parsed ? (
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"Planejamento Editorial — Setembro de 2026\nConceito editorial do mês\n...\n01 — 02/09 | DIREITO EMPRESARIAL\nHeadline\n...\nCopy\n..."}
              aria-label="Texto do planejamento"
              className="field-sizing-fixed h-[min(28rem,55svh)] resize-none font-mono text-xs"
              maxLength={PLANNING_LIMITS.document}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-primary-soft px-2 py-1 font-medium text-primary-ink">
                  {parsed.posts.length} {parsed.posts.length === 1 ? "post encontrado" : "posts encontrados"}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                  {parsed.concept ? (hasConcept ? "Conceito do mês: substitui o atual" : "Conceito do mês encontrado") : "Sem conceito do mês"}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">O texto original fica guardado no mês</span>
              </div>

              {parsed.warnings.length > 0 && (
                <Alert>
                  <AlertTriangleIcon />
                  <AlertTitle>Confira antes de importar</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {parsed.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <ul className="flex flex-col gap-2">
                {parsed.posts.map((post, index) => {
                  const Icon = FORMAT_ICONS[formatKind(post.format)];
                  const included = !excluded.has(index);
                  return (
                    <li key={index}>
                      <label
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40",
                          !included && "opacity-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() =>
                            setExcluded((current) => {
                              const next = new Set(current);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                          className="mt-1 size-4 accent-(--primary)"
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {post.number && <span className="font-semibold tabular-nums">#{post.number}</span>}
                            <span className={cn("tabular-nums", !post.date && "text-warning-ink")}>
                              {post.date ? formatCompactDay(post.date) : "sem data"}
                            </span>
                            {post.format && (
                              <span className="flex items-center gap-1">
                                <Icon className="size-3.5" />
                                {post.format}
                              </span>
                            )}
                            {post.topic && <span className="truncate">{post.topic}</span>}
                          </span>
                          <span className={cn("text-sm font-medium", !post.headline && "text-warning-ink")}>
                            {post.headline || "Sem headline"}
                          </span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">{post.copy || "Sem copy"}</span>
                          {post.sections.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              + {post.sections.map((section) => section.label).join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {existingPosts > 0 && chosen.length > 0 && (
                <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
                  <legend className="px-1 text-xs font-medium">
                    {monthLabel} já tem {existingPosts} {existingPosts === 1 ? "post" : "posts"}
                  </legend>
                  {(
                    [
                      ["append", "Adicionar aos que já existem"],
                      ["replace", "Substituir: os posts atuais do mês saem de vez"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={mode === value}
                        onChange={() => setMode(value)}
                        className="size-4 accent-(--primary)"
                      />
                      <span className={value === "replace" && mode === value ? "text-destructive-ink" : undefined}>{label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {parsed ? (
            <>
              <Button type="button" variant="outline" onClick={() => setParsed(null)} disabled={isPending}>
                <ArrowLeftIcon data-icon="inline-start" />
                Voltar ao texto
              </Button>
              <Button type="button" onClick={save} disabled={isPending}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <FileTextIcon data-icon="inline-start" />}
                {chosen.length > 0
                  ? `Importar ${chosen.length} ${chosen.length === 1 ? "post" : "posts"}`
                  : "Guardar só o documento"}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={read} disabled={!text.trim()}>
              <ClipboardPasteIcon data-icon="inline-start" />
              Separar os posts
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
