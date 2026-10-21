"use client";

import { Loader2Icon, SendIcon, UndoIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_STAGES, canSendStage, PLANNING_REVIEW_COMMENT_MAX, POST_KINDS, type ApprovalStage } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { registerClientDecision, sendForApproval, withdrawPlanningSend } from "./actions";
import type { PendingSendView, PostView } from "./types";

// Os envios ao cliente pela equipe: mandar a pauta ou as artes para aprovar,
// os envios que esperam resposta (com "Retirar envio") e registrar a resposta
// que o cliente deu por fora (admins).

const SEGMENT_CLASS =
  "flex h-8 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-control dark:aria-pressed:bg-input/50";

/** Os posts que podem ir ao cliente agora numa etapa (e não estão esperando nela). */
export function sendablePosts(posts: PostView[], approvesBrief: boolean, stage: ApprovalStage) {
  return posts.filter(
    (post) => post.waiting !== stage && canSendStage({ approvesBrief }, { ...post, hasArt: post.art.some((item) => item.role === "art") }, stage),
  );
}

/** "Enviar pauta" ou "Enviar artes": os posts que podem ir nessa etapa (todos marcados) e um recado opcional. */
export function SendForApprovalDialog({
  open,
  onOpenChange,
  planningId,
  month,
  monthLabel,
  posts,
  approvesBrief,
  stage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningId: string;
  month: string;
  monthLabel: string;
  posts: PostView[];
  approvesBrief: boolean;
  stage: ApprovalStage;
}) {
  const candidates = stage === "pauta" ? (approvesBrief ? sendablePosts(posts, true, "pauta") : []) : sendablePosts(posts, approvesBrief, "arte");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const chosen = candidates.filter((post) => !excluded.has(post.id));

  function toggle(id: string, checked: boolean) {
    setExcluded((current) => {
      const next = new Set(current);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendForApproval({ planningId, month, stage, postIds: chosen.map((post) => post.id), note }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível enviar.");
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{stage === "pauta" ? "Enviar a pauta para aprovação" : "Enviar as artes para aprovação"}</DialogTitle>
          <DialogDescription>
            {stage === "pauta"
              ? "O cliente aprova o texto dos posts antes das artes. "
              : "O cliente vê as artes como apresentação e no feed simulado. "}
            Ele vê no portal, recebe o aviso no sino e quem aprova recebe o e-mail. Enquanto ele não responde, o post fica travado para
            edição.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-5 flex min-h-0 flex-col gap-4 overflow-y-auto px-5">
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
              {stage === "pauta"
                ? "Nenhuma pauta para enviar: as que estão em rascunho ou com alteração já ajustada aparecem aqui."
                : approvesBrief
                  ? "Nenhuma arte para enviar: aparecem aqui os posts com arte e a pauta aprovada que ainda não foram ao cliente."
                  : "Nenhuma arte para enviar: aparecem aqui os posts com arte que ainda não foram ao cliente."}
            </p>
          ) : (
            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className="mb-1 text-xs text-muted-foreground">
                {stage === "pauta" ? "Pauta" : "Artes"} de {monthLabel}: {chosen.length} de {candidates.length}{" "}
                {candidates.length === 1 ? "post" : "posts"}
              </legend>
              {candidates.map((post) => (
                <label key={post.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <Checkbox checked={!excluded.has(post.id)} onCheckedChange={(checked) => toggle(post.id, checked)} />
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{post.dateLabel ?? "Sem data"}</span>
                  <span className="min-w-0 flex-1 truncate">{post.headline || "Sem headline"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{POST_KINDS[post.kind].label}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex flex-col gap-2 pb-1">
            <span id="send-note-label" className="text-sm font-medium">
              Recado <span className="font-normal text-muted-foreground">(opcional)</span>
            </span>
            <RichTextEditor
              aria-labelledby="send-note-label"
              value={note}
              onChange={setNote}
              placeholder="Ex.: o que observar, o que mudou desde a última rodada..."
              disabled={isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isPending || chosen.length === 0}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon data-icon="inline-start" />}
            Enviar {stage === "pauta" ? "a pauta de" : "as artes de"} {chosen.length} {chosen.length === 1 ? "post" : "posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Os envios do mês que esperam o cliente, com "Retirar envio" enquanto ele não respondeu nenhum post. */
export function PendingSends({ planningId, month, sends }: { planningId: string; month: string; sends: PendingSendView[] }) {
  const [target, setTarget] = useState<PendingSendView | null>(null);
  const [isPending, startTransition] = useTransition();
  if (sends.length === 0) return null;

  function handleWithdraw() {
    if (!target) return;
    startTransition(async () => {
      const result = await withdrawPlanningSend({ planningId, month, sendId: target.id }).catch(() => null);
      if (!result?.ok) toast.error(result && !result.ok ? result.error : "Não foi possível retirar.");
      else toast.success(result.message);
      setTarget(null);
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {sends.map((send) => (
        <li key={send.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/50 bg-warning/5 px-4 py-2.5 text-sm">
          <SendIcon className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{APPROVAL_STAGES[send.stage]}</span> enviada ao cliente em {send.sentAtLabel} por {send.sentByName}:{" "}
            {send.waiting} de {send.total} {send.total === 1 ? "post esperando" : "posts esperando"} resposta
            {send.answered > 0 && ` (${send.answered} ${send.answered === 1 ? "respondido" : "respondidos"})`}.
          </span>
          {send.answered === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setTarget(send)}>
              <UndoIcon data-icon="inline-start" />
              Retirar envio
            </Button>
          )}
        </li>
      ))}
      <AlertDialog open={target !== null} onOpenChange={(open) => !open && !isPending && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar este envio?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {target?.waiting} posts deixam de esperar o cliente e voltam para a equipe. O que o cliente já viu continua no portal, sem
              os botões de resposta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleWithdraw} disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              Retirar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ul>
  );
}

/** A etapa em que faz sentido registrar a resposta do cliente: a que espera, ou a próxima a decidir. */
export function decisionStageOf(post: PostView, approvesBrief: boolean): ApprovalStage {
  if (post.waiting) return post.waiting;
  if (approvesBrief && post.briefState !== "aprovada") return "pauta";
  return post.art.length > 0 ? "arte" : "pauta";
}

/** Admins registram a resposta que o cliente deu por fora: aprovar, ou pedir alteração dizendo o quê. */
export function RegisterDecisionDialog({
  target,
  planningId,
  approvesBrief,
  onClose,
}: {
  target: PostView | null;
  planningId: string;
  approvesBrief: boolean;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const post = target ?? shown;
  const stages: ApprovalStage[] = [
    ...(approvesBrief ? (["pauta"] as const) : []),
    ...(post && post.art.length > 0 ? (["arte"] as const) : []),
  ];
  const [stage, setStage] = useState<ApprovalStage | null>(null);
  const current = stage && stages.includes(stage) ? stage : post ? decisionStageOf(post, approvesBrief) : "pauta";
  const [decision, setDecision] = useState<"approved" | "changes">("approved");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStage(null);
    setDecision("approved");
    setComment("");
    setError(null);
  }

  function handleSave() {
    if (!post) return;
    startTransition(async () => {
      const result = await registerClientDecision({
        planningId,
        postIds: [post.id],
        stage: current,
        decision,
        comment: decision === "changes" ? comment : null,
      }).catch(() => null);
      if (!result?.ok) {
        setError(result && !result.ok ? result.error : "Não foi possível registrar.");
        return;
      }
      toast.success(result.message);
      reset();
      onClose();
    });
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (open || isPending) return;
        reset();
        onClose();
      }}
    >
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar a resposta do cliente</DialogTitle>
          <DialogDescription>
            Para quando o cliente respondeu por fora (WhatsApp, e-mail, reunião). Fica registrado que foi a equipe, em nome dele.
          </DialogDescription>
        </DialogHeader>
        {post && (
          <div className="flex flex-col gap-4">
            <p className="truncate text-sm font-medium">{post.headline || "Sem headline"}</p>
            {stages.length > 1 && (
              <div className="flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Etapa">
                {stages.map((value) => (
                  <button key={value} type="button" aria-pressed={current === value} onClick={() => setStage(value)} className={SEGMENT_CLASS}>
                    {APPROVAL_STAGES[value]}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(["approved", "changes"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={decision === value ? "soft" : "outline"}
                  aria-pressed={decision === value}
                  onClick={() => setDecision(value)}
                  className={cn(decision === value && "ring-1 ring-primary/40")}
                >
                  {value === "approved" ? "Aprovou" : "Pediu alteração"}
                </Button>
              ))}
            </div>
            {decision === "changes" && (
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="register-decision-comment">O que mudar</FieldLabel>
                <Textarea
                  id="register-decision-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={PLANNING_REVIEW_COMMENT_MAX}
                  className="min-h-24"
                />
              </Field>
            )}
            <FieldError>{error}</FieldError>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending || (decision === "changes" && !comment.trim())}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
