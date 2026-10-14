"use client";

import { AlertCircleIcon, AlertTriangleIcon, ArrowLeftIcon, BracesIcon, FileUpIcon, Loader2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCompactDay, monthOf } from "@/lib/calendar";
import { PLANNING_LIMITS, POST_KINDS } from "@/lib/planning";
import { parsePlanningJson, type ImportedPost } from "@/lib/planning-json";
import { cn } from "@/lib/utils";
import { importPosts } from "./actions";
import { CopyPromptButton } from "./copy-prompt-button";
import { KIND_ICONS } from "./planning-ui";

type Preview = { posts: ImportedPost[]; warnings: string[] };

/** Cola (ou abre) o JSON padrão do planejamento, mostra os posts e importa os escolhidos. */
export function ImportDialog({
  open,
  onOpenChange,
  planningId,
  month,
  monthLabel,
  existingPosts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningId: string;
  month: string;
  monthLabel: string;
  /** Quantos posts o mês já tem (para escolher entre adicionar e substituir). */
  existingPosts: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setText("");
    setErrors([]);
    setPreview(null);
    setExcluded(new Set());
    setMode("append");
  }

  function read(source: string) {
    const result = parsePlanningJson(source, month);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setPreview({ posts: result.posts, warnings: result.warnings });
    setExcluded(new Set());
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    if (file.size > PLANNING_LIMITS.importText) {
      setErrors(["O arquivo é grande demais."]);
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      read(content);
    } catch {
      setErrors(["Não foi possível ler o arquivo."]);
    }
  }

  const chosen = preview ? preview.posts.filter((_, index) => !excluded.has(index)) : [];

  function save() {
    if (chosen.length === 0) return;
    startTransition(async () => {
      const result = await importPosts({ planningId, month, mode, posts: chosen }).catch(() => null);
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
          <DialogTitle>Importar JSON: {monthLabel}</DialogTitle>
          <DialogDescription>
            {preview
              ? "Confira os posts. Desmarque o que não quer importar; depois dá para editar cada um."
              : "Cole o JSON do planejamento ou escolha o arquivo .json."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-5 min-h-0 overflow-y-auto px-5">
          {!preview ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Ainda está no Word? Copie o prompt, cole numa IA junto com o documento e traga aqui o JSON que ela devolver.
                </p>
                <CopyPromptButton month={month} className="shrink-0" />
              </div>
              <Textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  if (errors.length) setErrors([]);
                }}
                placeholder={'{\n  "posts": [\n    { "data": "2026-10-02", "tipo": "estatico", "headline": "...", ... }\n  ]\n}'}
                aria-label="JSON do planejamento"
                aria-invalid={errors.length > 0}
                spellCheck={false}
                className="field-sizing-fixed h-[min(24rem,50svh)] resize-none font-mono text-xs"
                maxLength={PLANNING_LIMITS.importText}
              />
              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>Não deu para ler o JSON</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  void openFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <span className="w-fit rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary-ink">
                {preview.posts.length} {preview.posts.length === 1 ? "post encontrado" : "posts encontrados"}
              </span>

              {preview.warnings.length > 0 && (
                <Alert>
                  <AlertTriangleIcon />
                  <AlertTitle>Confira antes de importar</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {preview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <ul className="flex flex-col gap-2">
                {preview.posts.map((post, index) => (
                  <li key={index}>
                    <PreviewRow
                      post={post}
                      number={index + 1}
                      outsideMonth={monthOf(post.date) !== month}
                      included={!excluded.has(index)}
                      onToggle={() =>
                        setExcluded((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                    />
                  </li>
                ))}
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
          {preview ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={isPending}>
                <ArrowLeftIcon data-icon="inline-start" />
                Voltar ao JSON
              </Button>
              <Button type="button" onClick={save} disabled={isPending || chosen.length === 0}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <BracesIcon data-icon="inline-start" />}
                {chosen.length > 0
                  ? `Importar ${chosen.length} ${chosen.length === 1 ? "post" : "posts"}`
                  : "Escolha algum post"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUpIcon data-icon="inline-start" />
                Abrir arquivo .json
              </Button>
              <Button type="button" onClick={() => read(text)} disabled={!text.trim()}>
                <BracesIcon data-icon="inline-start" />
                Conferir os posts
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({
  post,
  number,
  outsideMonth,
  included,
  onToggle,
}: {
  post: ImportedPost;
  number: number;
  outsideMonth: boolean;
  included: boolean;
  onToggle: () => void;
}) {
  const Icon = KIND_ICONS[post.kind];
  const parts =
    post.slides.length > 0
      ? `${post.slides.length} ${post.slides.length === 1 ? "slide" : "slides"}`
      : post.scenes.length > 0
        ? `${post.scenes.length} ${post.scenes.length === 1 ? "cena" : "cenas"}`
        : null;
  const extras = [
    post.supportText && "texto de apoio",
    post.cta && "CTA",
    post.hashtags.length > 0 && `${post.hashtags.length} ${post.hashtags.length === 1 ? "hashtag" : "hashtags"}`,
  ].filter(Boolean);

  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40", !included && "opacity-50")}>
      <input type="checkbox" checked={included} onChange={onToggle} className="mt-1 size-4 accent-(--primary)" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums">#{number}</span>
          <span className={cn("tabular-nums", outsideMonth && "text-warning-ink")}>{formatCompactDay(post.date)}</span>
          <span className="flex items-center gap-1">
            <Icon className="size-3.5" />
            {POST_KINDS[post.kind].label}
            {parts && ` · ${parts}`}
          </span>
        </span>
        <span className={cn("line-clamp-2 text-sm font-medium whitespace-pre-line", !post.headline && "text-warning-ink")}>
          {post.headline || "Sem headline"}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{post.copy || "Sem copy"}</span>
        {extras.length > 0 && <span className="text-xs text-muted-foreground">+ {extras.join(", ")}</span>}
      </span>
    </label>
  );
}
