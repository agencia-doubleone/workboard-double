"use client";

import { Loader2Icon, MessageSquareIcon, PaperclipIcon, SendHorizontalIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { PendingFileChip, useAttachmentUploads } from "@/components/messages/attachment-uploads";
import { Linkified } from "@/components/messages/linkified";
import { MessageAttachments } from "@/components/messages/message-attachments";
import { jumpToHashMessage } from "@/components/messages/message-tools";
import { useRealtimeEvent } from "@/components/realtime/realtime-store";
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
import { UserAvatar } from "@/components/user-avatar";
import { REQUEST_READ_EVENT, type RequestSide } from "@/lib/client-requests";
import { MESSAGE_ATTACHMENTS_MAX, MESSAGE_MAX_LENGTH } from "@/lib/jobs";
import { MEDIA_ACCEPT } from "@/lib/media";
import { messageElementId } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { RequestConversationActions, RequestMessageView } from "./types";

// Conversa da solicitação, entre o cliente e a agência: a mesma peça na tela da
// equipe e no portal, cada lado com as próprias Server Actions (`actions`).
// Recarrega a cada POLL_MS com a aba visível e, na equipe, quando chega
// notificação desta solicitação (tempo real). Cada carga marca como lida.

const POLL_MS = 15_000;
/** Mensagens seguidas da mesma pessoa dentro desse intervalo ficam agrupadas. */
const GROUP_MS = 5 * 60_000;

type RequestConversationProps = {
  requestId: string;
  messages: RequestMessageView[];
  /** Último "visto" antes desta visita (ISO), para a linha de "novas mensagens". */
  lastReadAt: string | null;
  uploadsEnabled: boolean;
  /** Quem está escrevendo: a equipe ou um contato do portal (rotas de envio diferentes). */
  via: "team" | "portal";
  actions: RequestConversationActions;
  /** Selo ao lado do nome de quem é de cada lado (ex.: "Cliente" na equipe, "Double One" no portal). */
  sideLabels: Partial<Record<RequestSide, string>>;
  /** Texto do estado vazio. */
  emptyText: string;
  /** Endereço da página: notificações em tempo real que levam a ela recarregam a conversa. */
  pageHref?: string;
};

export function RequestConversation({
  requestId,
  messages,
  lastReadAt,
  uploadsEnabled,
  via,
  actions,
  sideLabels,
  emptyText,
  pageHref,
}: RequestConversationProps) {
  const router = useRouter();
  // A linha de novas fica onde estava ao abrir, mesmo depois de marcar como lida.
  const [readMark] = useState(lastReadAt);
  const [deleteTarget, setDeleteTarget] = useState<RequestMessageView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const forceBottom = useRef(false);
  /** A primeira rolagem (ao abrir) já aconteceu. */
  const placed = useRef(false);
  /** A última mensagem que a rolagem já acompanhou. */
  const followedId = useRef<string | undefined>(undefined);
  // A referência da Server Action muda a cada carga da página: só a contagem de mensagens decide.
  const markRead = useEffectEvent(() => {
    void actions
      .markRead({ requestId })
      .catch(() => null)
      .then(() => window.dispatchEvent(new Event(REQUEST_READ_EVENT)));
  });

  const firstUnread = messages.findIndex((message) => !message.mine && (!readMark || message.createdAt > readMark));
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    markRead();
  }, [requestId, messages.length]);

  useEffect(() => {
    function tick() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  useRealtimeEvent((event) => {
    if (pageHref && event.type === "notification" && event.href?.split("#")[0] === pageHref) router.refresh();
  });

  // Ao abrir: vai para a mensagem do link (#mensagem-…, vindo da busca) ou para
  // a primeira não lida (ou para o fim). Numa aba escondida (Entregas | Conversa),
  // espera a conversa aparecer para rolar.
  const hasMessages = messages.length > 0;
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || placed.current) return;
    function place() {
      placed.current = true;
      if (jumpToHashMessage()) return;
      const divider = dividerRef.current;
      container!.scrollTop = divider ? divider.offsetTop - 12 : container!.scrollHeight;
    }
    if (container.clientHeight > 0) {
      place();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      place();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [hasMessages]);

  // Depois: acompanha as novas se a pessoa já estava no fim da conversa ou acabou de enviar.
  useEffect(() => {
    const previous = followedId.current;
    followedId.current = lastId;
    // Na primeira vez, quem posiciona é a rolagem de abertura.
    if (previous === undefined) return;
    const container = scrollRef.current;
    if (!container || !placed.current) return;
    if (atBottom.current || forceBottom.current) {
      forceBottom.current = false;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [lastId]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-raised">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
            <MessageSquareIcon className="size-5" />
          </span>
          <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            atBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
          }}
          className="relative flex max-h-[34rem] min-h-40 flex-col overflow-y-auto px-2 py-3 sm:px-3"
        >
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped =
              index !== firstUnread &&
              previous?.authorName === message.authorName &&
              previous.side === message.side &&
              Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_MS;
            return (
              <Fragment key={message.id}>
                {index === firstUnread && (
                  <div ref={dividerRef} className="my-2 flex items-center gap-3 px-2" role="separator">
                    <span className="h-px flex-1 bg-primary/40" />
                    <span className="text-xs font-medium text-primary-ink">Novas mensagens</span>
                    <span className="h-px flex-1 bg-primary/40" />
                  </div>
                )}
                <MessageItem
                  message={message}
                  grouped={grouped}
                  sideLabel={sideLabels[message.side]}
                  onDelete={() => {
                    setDeleteTarget(message);
                    setDeleteOpen(true);
                  }}
                />
              </Fragment>
            );
          })}
        </div>
      )}

      <Composer
        requestId={requestId}
        via={via}
        send={actions.send}
        discard={actions.discard}
        uploadsEnabled={uploadsEnabled}
        onSent={() => {
          forceBottom.current = true;
        }}
      />

      {deleteTarget && (
        <DeleteMessageDialog open={deleteOpen} onOpenChange={setDeleteOpen} message={deleteTarget} remove={actions.remove} />
      )}
    </div>
  );
}

function MessageItem({
  message,
  grouped,
  sideLabel,
  onDelete,
}: {
  message: RequestMessageView;
  grouped: boolean;
  sideLabel?: string;
  onDelete: () => void;
}) {
  return (
    <div
      id={messageElementId(message.id)}
      className={cn(
        "group/message relative flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted/40",
        !grouped && "mt-2 first:mt-0",
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && <UserAvatar name={message.authorName} imageUrl={message.authorImageUrl} className="mt-0.5 size-8" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-8">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium">{message.authorName}</span>
            {sideLabel && (
              <Badge variant={message.side === "client" ? "outline" : "soft"} className="h-4.5 self-center px-1.5 text-[10px]">
                {sideLabel}
              </Badge>
            )}
            <Hint label={message.time.absolute}>
              <span className="shrink-0 text-xs text-muted-foreground">{message.time.label}</span>
            </Hint>
          </div>
        )}
        {message.body && (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            <Linkified text={message.body} />
          </p>
        )}
        {message.attachments.length > 0 && <MessageAttachments attachments={message.attachments} />}
      </div>
      {message.canDelete && (
        <Hint label="Excluir mensagem">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir mensagem"
            onClick={onDelete}
            className="absolute top-1 right-1 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100 hover:text-destructive-ink"
          >
            <Trash2Icon />
          </Button>
        </Hint>
      )}
    </div>
  );
}

function Composer({
  requestId,
  via,
  send,
  discard,
  uploadsEnabled,
  onSent,
}: {
  requestId: string;
  via: "team" | "portal";
  send: RequestConversationActions["send"];
  discard: RequestConversationActions["discard"];
  uploadsEnabled: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { files, readyIds, uploading, full, addFiles, removeFile, clearSent } = useAttachmentUploads({
    folder: "solicitacoes",
    via,
    enabled: uploadsEnabled,
    max: MESSAGE_ATTACHMENTS_MAX,
    discard,
  });
  const canSend = !isPending && !uploading && (text.trim().length > 0 || readyIds.length > 0);

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    const body = text.trim();
    const attachmentIds = readyIds;
    startTransition(async () => {
      const result = await send({ requestId, body, attachmentIds }).catch(() => null);
      if (!result?.ok) {
        toast.error(result ? (result.fieldErrors?.body?.[0] ?? result.error) : "Não foi possível enviar.");
        return;
      }
      setText("");
      clearSent();
      onSent();
      textareaRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={(event) => {
        if (!uploadsEnabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!uploadsEnabled) return;
        event.preventDefault();
        setDragging(false);
        addFiles([...event.dataTransfer.files]);
      }}
      className={cn("border-t p-3 transition-colors", dragging && "bg-primary-soft/40")}
    >
      <div className="flex flex-col rounded-lg border border-input bg-background shadow-control transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 dark:bg-input/30">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b p-2">
            {files.map((file) => (
              <PendingFileChip key={file.localId} file={file} onRemove={() => removeFile(file)} />
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          onPaste={(event) => {
            const pasted = [...event.clipboardData.files];
            if (pasted.length === 0) return;
            event.preventDefault();
            addFiles(pasted, { pasted: true });
          }}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Escreva uma mensagem"
          aria-label="Mensagem"
          className="field-sizing-content max-h-48 min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground/80 md:text-sm"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          {uploadsEnabled && (
            <>
              <Hint label="Anexar arquivos">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Anexar arquivos"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={full}
                >
                  <PaperclipIcon />
                </Button>
              </Hint>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={MEDIA_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  addFiles([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">Enter envia · Shift+Enter quebra a linha</span>
          <Button type="submit" size="sm" className="ml-auto" disabled={!canSend}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon data-icon="inline-start" />}
            Enviar
          </Button>
        </div>
      </div>
    </form>
  );
}

function DeleteMessageDialog({
  open,
  onOpenChange,
  message,
  remove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: RequestMessageView;
  remove: RequestConversationActions["remove"];
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await remove({ messageId: message.id }).catch(() => null);
      if (result?.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result?.error ?? "Não foi possível excluir.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
          <AlertDialogDescription>
            {message.attachments.length > 0
              ? `A mensagem e ${message.attachments.length === 1 ? "o anexo saem" : `os ${message.attachments.length} anexos saem`} da conversa de vez, para todos.`
              : "A mensagem sai da conversa de vez, para todos."}
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
  );
}
