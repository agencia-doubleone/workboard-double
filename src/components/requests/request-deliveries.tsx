"use client";

import {
  ArchiveIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileIcon,
  Loader2Icon,
  PackageIcon,
  PencilIcon,
  PlayIcon,
  SendHorizontalIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { celebrate } from "@/components/celebration";
import { Hint } from "@/components/hint";
import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";
import { RichTextContent } from "@/components/rich-text-editor";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DELIVERY_COMMENT_MAX_LENGTH,
  DELIVERY_DECISIONS,
  DELIVERY_STATUSES,
  deliveryAnswerSummary,
  type DeliveryDecision,
} from "@/lib/client-requests";
import { cn } from "@/lib/utils";
import type { DeliveryAnswerActions, DeliveryFileView, DeliveryView } from "./types";

// Entregas para aprovação, iguais na equipe e no portal: cada rodada num card
// (a mais nova aberta, as anteriores recolhidas), com o recado, os arquivos e
// a resposta do cliente a cada um. No portal, quem pode aprovar responde
// arquivo por arquivo (rascunho) e depois envia as respostas de uma vez.
// Imagens e vídeos abrem num lightbox (com as respostas no rodapé). Aprovar um
// arquivo comemora na tela de quem aprovou (preferência "Comemorar aprovações").

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

type RequestDeliveriesProps = {
  deliveries: DeliveryView[];
  side: "team" | "portal";
  /** Portal: o contato pode responder (Pode aprovar). */
  canAnswer?: boolean;
  answer?: DeliveryAnswerActions;
  /** Equipe: retirar a rodada que ainda espera resposta. */
  withdraw?: (input: { deliveryId: string }) => Promise<ActionResult>;
  /** Equipe: numa rodada aprovada, tirar do servidor os arquivos das anteriores não aprovadas (as rodadas ficam). */
  removeOldFiles?: (input: { deliveryId: string }) => Promise<ActionResult>;
  /** Texto do estado vazio. */
  emptyText: string;
};

/**
 * Depois de uma rodada aprovada, as anteriores a ela (substituídas ou com
 * alterações pedidas) que ainda têm arquivo no servidor: os números delas e
 * quantos arquivos saem.
 */
function oldFilesBefore(deliveries: DeliveryView[], delivery: DeliveryView) {
  if (delivery.status !== "approved") return { rounds: [], files: 0 };
  const old = deliveries
    .filter((item) => item.round < delivery.round && (item.status === "superseded" || item.status === "changes_requested"))
    .filter((item) => item.files.some((entry) => entry.file))
    .sort((a, b) => a.round - b.round);
  return {
    rounds: old.map((item) => item.round),
    files: old.reduce((total, item) => total + item.files.filter((entry) => entry.file).length, 0),
  };
}

export function RequestDeliveries({
  deliveries,
  side,
  canAnswer = false,
  answer,
  withdraw,
  removeOldFiles,
  emptyText,
}: RequestDeliveriesProps) {
  if (deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-6 py-12 text-center shadow-raised">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
          <PackageIcon className="size-5" />
        </span>
        <p className="text-sm font-medium">Nenhuma entrega ainda</p>
        <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {deliveries.map((delivery, index) => (
        <DeliveryCard
          key={delivery.id}
          delivery={delivery}
          defaultOpen={index === 0}
          side={side}
          canAnswer={canAnswer && delivery.status === "pending" && Boolean(answer)}
          answer={answer}
          withdraw={withdraw}
          removeOldFiles={removeOldFiles}
          oldFiles={removeOldFiles ? oldFilesBefore(deliveries, delivery) : { rounds: [], files: 0 }}
        />
      ))}
    </div>
  );
}

function DeliveryStatusBadge({ status }: { status: DeliveryView["status"] }) {
  const definition = DELIVERY_STATUSES[status];
  return <Badge variant={definition.badge}>{definition.label}</Badge>;
}

function DeliveryCard({
  delivery,
  defaultOpen,
  side,
  canAnswer,
  answer,
  withdraw,
  removeOldFiles,
  oldFiles,
}: {
  delivery: DeliveryView;
  defaultOpen: boolean;
  side: "team" | "portal";
  canAnswer: boolean;
  answer?: DeliveryAnswerActions;
  withdraw?: RequestDeliveriesProps["withdraw"];
  removeOldFiles?: RequestDeliveriesProps["removeOldFiles"];
  oldFiles: OldFiles;
}) {
  const files = delivery.files.length;
  const decide = canAnswer ? answer?.decide : undefined;
  // Imagens e vídeos da rodada (que ainda estão no servidor), na ordem, para o lightbox.
  const media: LightboxItem[] = delivery.files.flatMap((entry) =>
    entry.file?.preview ? [{ id: entry.id, url: entry.file.url, name: entry.name, kind: entry.file.preview }] : [],
  );
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <details open={defaultOpen} className="group/delivery overflow-hidden rounded-xl border bg-card shadow-raised">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open/delivery:rotate-90" />
        <span className="text-sm font-semibold">Rodada {delivery.round}</span>
        <DeliveryStatusBadge status={delivery.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          {files === 1 ? "1 arquivo" : `${files} arquivos`} · {delivery.sentAt}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4">
        <p className="text-xs text-muted-foreground">
          Enviada por {delivery.sentBy}
          {side === "portal" ? " (Double One)" : ""} em {delivery.sentAt}
        </p>
        {delivery.note && <RichTextContent html={delivery.note} />}
        {/* Só a equipe vê o aviso (o portal nem recebe essa informação). */}
        {side === "team" && delivery.filesRemoved && (
          <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <ArchiveIcon className="size-3.5 shrink-0" />
            Os arquivos desta rodada foram excluídos do servidor em {delivery.filesRemoved.at}
            {delivery.filesRemoved.by ? ` por ${delivery.filesRemoved.by}` : ""}, depois que uma rodada mais nova foi aprovada.
            As respostas ficam aqui.
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {delivery.files.map((file) => (
            <li key={file.id}>
              <DeliveryFileCard
                file={file}
                pending={delivery.status === "pending"}
                side={side}
                decide={decide}
                onView={file.file?.preview ? () => setViewing(media.findIndex((item) => item.id === file.id)) : undefined}
              />
            </li>
          ))}
        </ul>
        <DeliveryFooter
          delivery={delivery}
          side={side}
          canAnswer={canAnswer}
          answer={answer}
          withdraw={withdraw}
          removeOldFiles={removeOldFiles}
          oldFiles={oldFiles}
        />
      </div>
      <MediaLightbox
        items={media}
        index={viewing}
        onIndexChange={setViewing}
        renderFooter={(item) => {
          const file = delivery.files.find((candidate) => candidate.id === item.id);
          return file ? (
            <div className="mx-auto w-full max-w-md">
              <FileDecision
                key={file.id}
                file={file}
                pending={delivery.status === "pending"}
                side={side}
                decide={decide}
              />
            </div>
          ) : null;
        }}
      />
    </details>
  );
}

function DeliveryFileCard({
  file,
  pending,
  side,
  decide,
  onView,
}: {
  file: DeliveryFileView;
  pending: boolean;
  side: "team" | "portal";
  /** Presente quando quem vê pode responder este arquivo. */
  decide?: DeliveryAnswerActions["decide"];
  /** Imagem ou vídeo: abre no lightbox. */
  onView?: () => void;
}) {
  const { name } = file;
  const media = file.file;
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border bg-background",
        file.decision === "approved" && "border-success/40",
        file.decision === "changes" && "border-destructive/40",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {!media ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <ArchiveIcon className="size-7" />
            <span className="text-xs">{side === "team" ? "Arquivo excluído do servidor" : "Arquivo não disponível"}</span>
          </span>
        ) : media.preview && onView ? (
          <button
            type="button"
            onClick={onView}
            aria-label={`Ver ${name} em tamanho grande`}
            className="group/preview absolute inset-0 flex cursor-zoom-in items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            {media.preview === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- arquivo do CDN
              <img src={media.url} alt={name} loading="lazy" className="size-full object-contain" />
            ) : (
              <>
                {/* Só o primeiro quadro; o vídeo toca no lightbox. */}
                <video src={media.url} muted preload="metadata" className="size-full bg-black object-contain" />
                <span className="absolute flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-control transition-transform group-hover/preview:scale-105">
                  <PlayIcon className="size-5 translate-x-px" />
                </span>
              </>
            )}
          </button>
        ) : (
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir ${name}`}
            className="absolute inset-0 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileIcon className="size-8" />
              {media.extension && <span className="text-xs font-semibold tracking-wide">{media.extension}</span>}
            </span>
          </a>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-2">
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className={cn("truncate text-sm font-medium", !media && "text-muted-foreground")} title={name}>
              {name}
            </span>
            <span className="text-xs text-muted-foreground">{media ? media.size : side === "team" ? "Fora do servidor" : "Versão anterior"}</span>
          </span>
          {media && (
            <Hint label="Abrir em outra aba">
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir ${name} em outra aba`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Hint>
          )}
        </div>
        <FileDecision file={file} pending={pending} side={side} decide={decide} />
      </div>
    </div>
  );
}

/** A resposta a um arquivo: os botões (quem pode responder), o pedido de alteração ou o que já foi respondido. */
function FileDecision({
  file,
  pending,
  side,
  decide,
}: {
  file: DeliveryFileView;
  pending: boolean;
  side: "team" | "portal";
  decide?: DeliveryAnswerActions["decide"];
}) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(file.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(decision: DeliveryDecision | null, text = "") {
    if (!decide) return;
    startTransition(async () => {
      const result = await decide({ fileId: file.id, decision, comment: text }).catch(() => null);
      if (!result?.ok) {
        const message = result ? (result.fieldErrors?.comment?.[0] ?? result.error) : "Não foi possível salvar. Tente de novo.";
        if (result?.fieldErrors?.comment) setError(message);
        else toast.error(message);
        return;
      }
      setError(null);
      setEditing(false);
      if (decision === "approved") celebrate();
    });
  }

  if (decide && editing) {
    return (
      <div className="mt-auto flex flex-col gap-2">
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={DELIVERY_COMMENT_MAX_LENGTH}
          rows={3}
          autoFocus
          placeholder="O que precisa mudar neste arquivo?"
          aria-label={`O que mudar em ${file.name}`}
          aria-invalid={!!error}
          disabled={isPending}
        />
        {error && <p className="text-xs text-destructive-ink">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setEditing(false);
              setError(null);
              setComment(file.comment ?? "");
            }}
          >
            Cancelar
          </Button>
          <Button size="sm" disabled={isPending} onClick={() => save("changes", comment)}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Pedir alteração
          </Button>
        </div>
      </div>
    );
  }

  if (file.decision) {
    const definition = DELIVERY_DECISIONS[file.decision];
    return (
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={definition.badge}>
            {file.decision === "approved" ? <CheckIcon data-icon="inline-start" /> : <PencilIcon data-icon="inline-start" />}
            {definition.label}
          </Badge>
          {pending && file.decidedBy && <span className="text-xs text-muted-foreground">por {file.decidedBy}</span>}
          {decide && (
            <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" disabled={isPending} onClick={() => save(null)}>
              {isPending ? <Loader2Icon className="animate-spin" /> : <Undo2Icon data-icon="inline-start" />}
              Desfazer
            </Button>
          )}
        </div>
        {file.comment && (
          <p className="rounded-md bg-muted/60 px-2.5 py-2 text-sm whitespace-pre-line text-foreground">{file.comment}</p>
        )}
      </div>
    );
  }

  if (decide) {
    return (
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => setEditing(true)}>
          <PencilIcon data-icon="inline-start" />
          Pedir alteração
        </Button>
        <Button size="sm" disabled={isPending} onClick={() => save("approved")}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon data-icon="inline-start" />}
          Aprovar
        </Button>
      </div>
    );
  }

  if (!pending) return null;
  return (
    <p className="mt-auto text-xs text-muted-foreground">
      {side === "team" ? "Esperando a resposta do cliente." : "Esperando a aprovação."}
    </p>
  );
}

function DeliveryFooter({
  delivery,
  side,
  canAnswer,
  answer,
  withdraw,
  removeOldFiles,
  oldFiles,
}: {
  delivery: DeliveryView;
  side: "team" | "portal";
  canAnswer: boolean;
  answer?: DeliveryAnswerActions;
  withdraw?: RequestDeliveriesProps["withdraw"];
  removeOldFiles?: RequestDeliveriesProps["removeOldFiles"];
  oldFiles: OldFiles;
}) {
  const total = delivery.files.length;
  const approved = delivery.files.filter((file) => file.decision === "approved").length;
  const changes = delivery.files.filter((file) => file.decision === "changes").length;

  if (delivery.status === "pending" && canAnswer && answer) {
    return <SubmitAnswers delivery={delivery} total={total} approved={approved} changes={changes} submit={answer.submit} />;
  }
  if (delivery.status === "pending") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-sm text-muted-foreground">
          {side === "team"
            ? "O cliente responde cada arquivo no portal; você é avisado quando ele enviar as respostas."
            : "Quem aprova as entregas pela sua empresa responde por aqui. Comentários vão na conversa."}
        </p>
        {side === "team" && withdraw && <WithdrawDelivery delivery={delivery} withdraw={withdraw} />}
      </div>
    );
  }
  if (delivery.status === "superseded") {
    return <p className="border-t pt-3 text-sm text-muted-foreground">Substituída por uma rodada mais nova antes da resposta.</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        Respondida por <span className="font-medium text-foreground">{delivery.answeredBy ?? "o cliente"}</span>
        {delivery.answeredAt ? ` em ${delivery.answeredAt}` : ""}: {deliveryAnswerSummary(approved, changes)}.
      </p>
      {side === "team" && removeOldFiles && oldFiles.files > 0 && (
        <RemoveOldFiles delivery={delivery} oldFiles={oldFiles} removeOldFiles={removeOldFiles} />
      )}
    </div>
  );
}

/** "1", "1 e 2", "1, 2 e 3". */
function roundList(rounds: number[]) {
  return rounds.length > 1 ? `${rounds.slice(0, -1).join(", ")} e ${rounds.at(-1)}` : String(rounds[0] ?? "");
}

type OldFiles = { rounds: number[]; files: number };

/**
 * Equipe, numa rodada aprovada: tira do servidor os arquivos das rodadas
 * anteriores que não foram aprovadas. As rodadas e as respostas ficam.
 */
function RemoveOldFiles({
  delivery,
  oldFiles,
  removeOldFiles,
}: {
  delivery: DeliveryView;
  oldFiles: OldFiles;
  removeOldFiles: NonNullable<RequestDeliveriesProps["removeOldFiles"]>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { rounds, files } = oldFiles;
  const which = rounds.length === 1 ? `da rodada ${rounds[0]}` : `das rodadas ${roundList(rounds)}`;
  const count = files === 1 ? "o arquivo" : `os ${files} arquivos`;

  function handleConfirm() {
    startTransition(async () => {
      const result = await removeOldFiles({ deliveryId: delivery.id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível excluir. Tente de novo.");
        return;
      }
      toast.success(result.message);
      setOpen(false);
    });
  }

  return (
    <>
      <Hint label="Libera o servidor de arquivos: as versões que não foram aprovadas saem, as rodadas ficam no histórico">
        <Button variant="outline" size="sm" className="text-destructive-ink" onClick={() => setOpen(true)}>
          <Trash2Icon data-icon="inline-start" />
          Excluir arquivos das rodadas anteriores
        </Button>
      </Hint>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Excluir {count} {which}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Eles saem do servidor de vez. As rodadas continuam no histórico (aqui e no portal), com o nome de cada arquivo e
              as respostas do cliente. A rodada {delivery.round}, aprovada, não muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <HoldToConfirmButton
              label="Segure para excluir"
              pendingLabel="Excluindo..."
              icon={<Trash2Icon />}
              pending={isPending}
              onConfirm={handleConfirm}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Portal: o progresso das respostas e o "Enviar respostas", liberado com todos os arquivos respondidos. */
function SubmitAnswers({
  delivery,
  total,
  approved,
  changes,
  submit,
}: {
  delivery: DeliveryView;
  total: number;
  approved: number;
  changes: number;
  submit: DeliveryAnswerActions["submit"];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const answered = approved + changes;
  const ready = answered === total;

  function handleSubmit() {
    startTransition(async () => {
      const result = await submit({ deliveryId: delivery.id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível enviar. Tente de novo.");
        return;
      }
      toast.success(result.message);
      setOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm">
          <span className="font-medium tabular-nums">
            {answered} de {total}
          </span>{" "}
          <span className="text-muted-foreground">
            {total === 1 ? "arquivo respondido" : "arquivos respondidos"}
            {ready ? "" : ": responda todos para enviar."}
          </span>
        </p>
        <span className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${(answered / Math.max(total, 1)) * 100}%` }} />
        </span>
      </div>
      <Button disabled={!ready} onClick={() => setOpen(true)}>
        <SendHorizontalIcon data-icon="inline-start" />
        Enviar respostas
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <SendHorizontalIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Enviar as respostas da rodada {delivery.round}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deliveryAnswerSummary(approved, changes)}. Depois de enviar, as respostas não mudam mais e a Double One é avisada
              {changes > 0 ? " para fazer as alterações" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              Enviar respostas
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Equipe: retira a rodada que ainda espera resposta (os arquivos saem do CDN). */
function WithdrawDelivery({ delivery, withdraw }: { delivery: DeliveryView; withdraw: NonNullable<RequestDeliveriesProps["withdraw"]> }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await withdraw({ deliveryId: delivery.id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível retirar. Tente de novo.");
        return;
      }
      toast.success(result.message);
      setOpen(false);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="text-destructive-ink" onClick={() => setOpen(true)}>
        <Trash2Icon data-icon="inline-start" />
        Retirar rodada
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Retirar a rodada {delivery.round}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela some do portal (com as respostas em rascunho do cliente) e os arquivos são apagados. Para trocar os arquivos,
              também dá para mandar uma rodada nova: esta fica como substituída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <HoldToConfirmButton
              label="Segure para retirar"
              pendingLabel="Retirando..."
              icon={<Trash2Icon />}
              pending={isPending}
              onConfirm={handleConfirm}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
