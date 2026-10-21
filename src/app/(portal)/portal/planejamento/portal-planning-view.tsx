"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, MessageSquareTextIcon, PencilLineIcon, SendIcon, UndoIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { celebrate } from "@/components/celebration";
import { ClientPlanningMonth } from "@/components/planning/client-month";
import type { PlanningPastPostView, PlanningPostView, PlanningProfileView, PortalPostStateView } from "@/components/planning/types";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_READ_EVENT } from "@/lib/client-requests";
import { PLANNING_REVIEW_COMMENT_MAX } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { decidePlanningPost, markPlanningMonthRead, submitPlanningAnswers } from "./actions";

// O mês do planejamento no portal (as mesmas telas da prévia da equipe): a
// pauta em cards, como a equipe vê o mês, e as artes na apresentação, no feed e
// na lista, com a resposta em cada post que espera o cliente e, embaixo,
// "Enviar respostas" e "Aprovar tudo". As respostas são rascunho
// (os contatos veem, a equipe não) até serem enviadas.

type Props = {
  month: string;
  monthLabel: string;
  concept: string | null;
  posts: PlanningPostView[];
  states: Record<string, PortalPostStateView>;
  pastPosts: PlanningPastPostView[];
  profile: PlanningProfileView;
  canApprove: boolean;
  previousHref: string | null;
  nextHref: string | null;
};

export function PortalPlanningView({ month, monthLabel, concept, posts, states, pastPosts, profile, canApprove, previousHref, nextHref }: Props) {
  const waiting = posts.filter((post) => states[post.id]?.sendPostId);
  const answered = waiting.filter((post) => states[post.id]?.draft);
  const approved = posts.filter((post) => post.stage === "arte" && states[post.id]?.last?.decision === "approved" && !states[post.id]?.sendPostId);

  // Abrir o mês dá como vistas as notificações dele (e o sino reconta).
  useEffect(() => {
    void markPlanningMonthRead({ month })
      .catch(() => null)
      .then(() => window.dispatchEvent(new Event(REQUEST_READ_EVENT)));
  }, [month]);

  return (
    <div className={cn("flex flex-col gap-6", waiting.length > 0 && canApprove && "pb-28")}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Planejamento de redes sociais</p>
          <div className="flex items-center gap-2">
            <MonthLink href={previousHref} label="Mês anterior" icon={ChevronLeftIcon} />
            <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{monthLabel}</h1>
            <MonthLink href={nextHref} label="Próximo mês" icon={ChevronRightIcon} />
          </div>
          <p className="text-sm text-muted-foreground">
            {waiting.length > 0
              ? canApprove
                ? `${waiting.length} ${waiting.length === 1 ? "post esperando" : "posts esperando"} a sua resposta.`
                : `${waiting.length} ${waiting.length === 1 ? "post esperando" : "posts esperando"} a resposta de quem aprova.`
              : "Nada esperando resposta neste mês."}{" "}
            {approved.length > 0 && `${approved.length} de ${posts.length} com a arte aprovada.`}
          </p>
        </div>
      </header>

      <ClientPlanningMonth
        monthLabel={monthLabel}
        concept={concept}
        posts={posts}
        pastPosts={pastPosts}
        profile={profile}
        // Abre na etapa que espera resposta (a pauta antes das artes).
        initialStage={waiting.some((post) => post.stage === "pauta") ? "pauta" : waiting.length > 0 ? "arte" : undefined}
        renderActions={(post) => <PostAnswer post={post} state={states[post.id]} canApprove={canApprove} />}
        renderStatus={(post) => <StatusLabel post={post} state={states[post.id]} />}
      />

      {waiting.length > 0 && canApprove && <AnswerBar month={month} waiting={waiting.length} answered={answered.length} />}
    </div>
  );
}

function MonthLink({ href, label, icon: Icon }: { href: string | null; label: string; icon: typeof ChevronLeftIcon }) {
  if (!href) {
    return (
      <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "pointer-events-none opacity-30")} aria-hidden="true">
        <Icon />
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
      <Icon />
    </Link>
  );
}

const STAGE_TEXT = { pauta: "pauta", arte: "arte" } as const;

/** A situação na lista: espera resposta, resposta em rascunho, aprovado ou alteração pedida. */
function StatusLabel({ post, state }: { post: PlanningPostView; state: PortalPostStateView | undefined }) {
  const stage = STAGE_TEXT[post.stage];
  if (state?.sendPostId) {
    if (state.draft) return <span>{state.draft.decision === "approved" ? "Aprovado" : "Alteração pedida"} (não enviado)</span>;
    return <Badge variant="warning">Esperando resposta ({stage})</Badge>;
  }
  if (state?.last?.decision === "approved") return <Badge variant="success">{post.stage === "arte" ? "Aprovado" : "Pauta aprovada"}</Badge>;
  if (state?.last) return <Badge variant="destructive">Alteração pedida ({stage})</Badge>;
  return <span>Enviado</span>;
}

/** A resposta de um post: aprovar ou pedir alteração (com o que mudar), e desfazer enquanto não foi enviada. */
function PostAnswer({ post, state, canApprove }: { post: PlanningPostView; state: PortalPostStateView | undefined; canApprove: boolean }) {
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!state) return null;
  const stage = STAGE_TEXT[post.stage];

  if (!state.sendPostId) {
    if (!state.last) return null;
    return (
      <div className="flex max-w-md flex-col items-end gap-1 text-right text-xs text-muted-foreground">
        <Badge variant={state.last.decision === "approved" ? "success" : "destructive"}>
          {state.last.decision === "approved" ? (post.stage === "arte" ? "Aprovado" : "Pauta aprovada") : "Alteração pedida"}
        </Badge>
        <span>
          {state.last.byTeam ? `Registrado pela Double One (${state.last.byName})` : state.last.byName} em {state.last.dateLabel}
        </span>
        {state.last.comment && <span className="whitespace-pre-wrap">“{state.last.comment}”</span>}
      </div>
    );
  }

  function decide(decision: "approved" | "changes" | null, text = "") {
    const sendPostId = state?.sendPostId;
    if (!sendPostId) return;
    startTransition(async () => {
      const result = await decidePlanningPost({ sendPostId, decision, comment: decision === "changes" ? text : null }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível guardar a resposta.");
        return;
      }
      if (decision === "approved") celebrate();
      setAsking(false);
    });
  }

  if (!canApprove) {
    return (
      <span className="text-xs text-muted-foreground">
        {state.draft
          ? `${state.draft.byName} marcou como ${state.draft.decision === "approved" ? "aprovado" : "alteração pedida"} (ainda não enviado)`
          : "Esperando a resposta de quem aprova"}
      </span>
    );
  }

  if (state.draft && !asking) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="flex max-w-sm flex-col items-end gap-0.5 text-right text-xs text-muted-foreground">
          <Badge variant={state.draft.decision === "approved" ? "success" : "destructive"}>
            {state.draft.decision === "approved" ? "Aprovado" : "Alteração pedida"}
          </Badge>
          {state.draft.comment && <span className="line-clamp-2 whitespace-pre-wrap">“{state.draft.comment}”</span>}
          <span>Ainda não enviado à Double One</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => decide(null)} disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <UndoIcon data-icon="inline-start" />}
          Desfazer
        </Button>
      </div>
    );
  }

  if (asking) {
    return (
      <div className="flex w-full max-w-md flex-col gap-2">
        <label htmlFor={`changes-${post.id}`} className="text-xs font-medium">
          O que mudar na {stage}?
        </label>
        <Textarea
          id={`changes-${post.id}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={PLANNING_REVIEW_COMMENT_MAX}
          className="min-h-20"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setAsking(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => decide("changes", comment)} disabled={isPending || !comment.trim()}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Pedir alteração
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => setAsking(true)} disabled={isPending}>
        <PencilLineIcon data-icon="inline-start" />
        Pedir alteração
      </Button>
      <Button size="sm" onClick={() => decide("approved")} disabled={isPending}>
        {isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon data-icon="inline-start" />}
        Aprovar {post.stage === "pauta" ? "pauta" : ""}
      </Button>
    </div>
  );
}

/** A barra de baixo: quantos já foram respondidos, o recado geral, "Enviar respostas" e "Aprovar tudo". */
function AnswerBar({ month, waiting, answered }: { month: string; waiting: number; answered: number }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rest = waiting - answered;

  function submit(approveRest: boolean) {
    startTransition(async () => {
      const result = await submitPlanningAnswers({ month, note: note.trim() || null, approveRest }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível enviar as respostas.");
        return;
      }
      if (approveRest && rest > 0) celebrate();
      toast.success(result.message);
      setNote("");
      setNoteOpen(false);
      setConfirmAll(false);
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 shadow-overlay md:left-(--sidebar-width) md:sidebar-collapsed:left-(--sidebar-width-icon)">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        {noteOpen && (
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Um recado geral para a equipe (opcional): vai junto com as respostas."
            maxLength={PLANNING_REVIEW_COMMENT_MAX}
            className="min-h-16"
            aria-label="Recado geral"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm">
            <span className="font-medium tabular-nums">
              {answered} de {waiting}
            </span>{" "}
            {waiting === 1 ? "post respondido" : "posts respondidos"}
            <span className="hidden text-muted-foreground sm:inline">. O que ficar sem resposta continua esperando.</span>
          </p>
          {!noteOpen && (
            <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
              <MessageSquareTextIcon data-icon="inline-start" />
              Recado
            </Button>
          )}
          {rest > 0 && (
            <Button variant="outline" onClick={() => setConfirmAll(true)} disabled={isPending}>
              <CheckIcon data-icon="inline-start" />
              Aprovar tudo
            </Button>
          )}
          <Button onClick={() => submit(false)} disabled={isPending || answered === 0}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon data-icon="inline-start" />}
            Enviar respostas
          </Button>
        </div>
      </div>
      <AlertDialog open={confirmAll} onOpenChange={(open) => !isPending && setConfirmAll(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Aprovar {rest === 1 ? "o post que falta" : `os ${rest} posts que faltam`} e enviar as respostas?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {answered > 0
                ? "Os que você já respondeu continuam como estão (inclusive as alterações pedidas). Tudo vai de uma vez para a Double One."
                : "Tudo vai de uma vez para a Double One."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit(true)} disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              Aprovar e enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
