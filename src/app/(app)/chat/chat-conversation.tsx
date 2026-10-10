"use client";

import {
  ArrowLeftIcon,
  CheckCheckIcon,
  CheckIcon,
  Loader2Icon,
  MessagesSquareIcon,
  PaperclipIcon,
  SendHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { PendingFileChip, useAttachmentUploads } from "@/components/messages/attachment-uploads";
import { Linkified } from "@/components/messages/linkified";
import { MessageAttachments } from "@/components/messages/message-attachments";
import {
  getRealtimeState,
  sendRealtime,
  useIsTyping,
  useRealtimeEvent,
} from "@/components/realtime/realtime-store";
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
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { TYPING_SIGNAL_MS } from "@/lib/chat";
import { MESSAGE_ATTACHMENTS_MAX, MESSAGE_MAX_LENGTH } from "@/lib/jobs";
import { MEDIA_ACCEPT } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  deleteChatMessage,
  discardChatAttachment,
  loadOlderChatMessages,
  markConversationRead,
  sendChatMessage,
} from "./actions";
import type { ChatMessageView, ConversationView } from "./types";

/** Mensagens seguidas da mesma pessoa dentro desse intervalo formam um bloco (hora só no último). */
const GROUP_MS = 5 * 60_000;

type ChatConversationProps = {
  conversation: ConversationView;
  /** As mais recentes, em ordem de envio. */
  messages: ChatMessageView[];
  /** Há mensagens antes das carregadas. */
  hasMore: boolean;
  uploadsEnabled: boolean;
};

export function ChatConversation({ conversation, messages, hasMore, uploadsEnabled }: ChatConversationProps) {
  const router = useRouter();
  const { other } = conversation;
  const otherTyping = useIsTyping(other?.id);

  // A página traz só as últimas mensagens. As que saem dessa janela (porque
  // chegaram novas) e as carregadas com "anteriores" ficam aqui.
  const [history, setHistory] = useState<ChatMessageView[]>([]);
  const [serverMessages, setServerMessages] = useState(messages);
  if (messages !== serverMessages) {
    const start = messages[0]?.createdAt;
    const dropped = start ? serverMessages.filter((message) => message.createdAt < start) : [];
    setServerMessages(messages);
    if (dropped.length > 0) setHistory((current) => [...current, ...dropped]);
  }
  const all = [...history, ...messages];
  const [olderHasMore, setOlderHasMore] = useState(hasMore);
  const [loadingOlder, startLoadingOlder] = useTransition();

  // Leituras: a minha (para não marcar de novo) e a da outra pessoa (o "Visto"), que muda em tempo real.
  const [myReadAt, setMyReadAt] = useState(conversation.myLastReadAt);
  const [liveOtherReadAt, setLiveOtherReadAt] = useState<string | null>(null);
  const otherReadAt = [other?.lastReadAt, liveOtherReadAt].filter(Boolean).sort().at(-1) ?? null;
  // A linha de "novas mensagens" fica onde estava ao abrir, mesmo depois de ler.
  const [readMark] = useState(conversation.myLastReadAt);
  const firstUnread = all.findIndex((message) => !message.mine && (!readMark || message.createdAt > readMark));

  const [deleteTarget, setDeleteTarget] = useState<ChatMessageView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const forceBottom = useRef(false);
  const mounted = useRef(false);
  const keepPosition = useRef<number | null>(null);

  const lastId = all.at(-1)?.id;
  const lastIncoming = all.findLast((message) => !message.mine);
  const lastMine = all.findLast((message) => message.mine);

  useRealtimeEvent((event) => {
    if (event.type === "chat.read" && event.conversationId === conversation.id && event.userId === other?.id) {
      setLiveOtherReadAt(event.lastReadAt);
    }
    if (event.type === "chat.deleted" && event.conversationId === conversation.id) {
      setHistory((current) => current.filter((message) => message.id !== event.messageId));
    }
  });

  // Lê o que chegou, com a aba visível.
  useEffect(() => {
    function markRead() {
      if (document.visibilityState !== "visible" || !lastIncoming) return;
      if (myReadAt && lastIncoming.createdAt <= myReadAt) return;
      void markConversationRead({ conversationId: conversation.id })
        .catch(() => null)
        .then((result) => {
          if (!result) return;
          setMyReadAt(result.lastReadAt);
          // Sem tempo real, a lista de conversas não fica sabendo sozinha.
          if (getRealtimeState().status !== "open") router.refresh();
        });
    }
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [conversation.id, lastIncoming, myReadAt, router]);

  // Ao abrir: vai para a primeira não lida (ou para o fim). Depois, acompanha as
  // novas se a pessoa estava no fim ou acabou de enviar.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (!mounted.current) {
      mounted.current = true;
      const divider = dividerRef.current;
      container.scrollTop = divider ? divider.offsetTop - 12 : container.scrollHeight;
      return;
    }
    if (atBottom.current || forceBottom.current) {
      forceBottom.current = false;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [lastId]);

  // "Anteriores" entram em cima sem mexer no que a pessoa está vendo.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || keepPosition.current === null) return;
    container.scrollTop += container.scrollHeight - keepPosition.current;
    keepPosition.current = null;
  }, [history]);

  // O "digitando…" aparece no fim: acompanha se a pessoa já estava lá.
  useEffect(() => {
    const container = scrollRef.current;
    if (otherTyping && container && atBottom.current) container.scrollTo({ top: container.scrollHeight });
  }, [otherTyping]);

  function loadOlder() {
    const first = all[0];
    if (!first) return;
    startLoadingOlder(async () => {
      const result = await loadOlderChatMessages({ conversationId: conversation.id, before: first.createdAt }).catch(
        () => null,
      );
      if (!result) {
        toast.error("Não foi possível carregar as mensagens anteriores.");
        return;
      }
      keepPosition.current = scrollRef.current?.scrollHeight ?? null;
      setHistory((current) => [...result.messages, ...current]);
      setOlderHasMore(result.hasMore);
    });
  }

  const canWrite = Boolean(other?.active);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
        <Link
          href="/chat"
          aria-label="Voltar para as conversas"
          className="-ml-1 flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <UserAvatar name={conversation.title} imageUrl={other?.imageUrl} className="size-9" />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-sm font-semibold">{conversation.title}</h1>
          <p className={cn("truncate text-xs", otherTyping ? "text-primary-ink" : "text-muted-foreground")}>
            {otherTyping
              ? "digitando…"
              : !other
                ? "Não está mais no Workboard"
                : !other.active
                  ? "Conta desativada"
                  : "Conversa privada entre vocês dois"}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          atBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-5"
      >
        {olderHasMore && all.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mx-auto mb-3 text-muted-foreground"
            disabled={loadingOlder}
            onClick={loadOlder}
          >
            {loadingOlder && <Loader2Icon className="animate-spin" />}
            Carregar mensagens anteriores
          </Button>
        )}
        {all.length === 0 ? (
          <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
              <MessagesSquareIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
            <p className="text-sm text-muted-foreground">
              {canWrite ? `Mande a primeira para ${conversation.title}.` : "Esta conversa está vazia."}
            </p>
          </div>
        ) : (
          all.map((message, index) => {
            const previous = all[index - 1];
            const next = all[index + 1];
            const newDay = previous?.day !== message.day;
            const sameAsPrevious =
              !newDay &&
              index !== firstUnread &&
              previous?.authorId === message.authorId &&
              Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_MS;
            const endsGroup =
              !next ||
              next.day !== message.day ||
              next.authorId !== message.authorId ||
              index + 1 === firstUnread ||
              Date.parse(next.createdAt) - Date.parse(message.createdAt) >= GROUP_MS;
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <div className="my-3 flex justify-center first:mt-0" role="separator">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground first-letter:uppercase">
                      {message.dayLabel}
                    </span>
                  </div>
                )}
                {index === firstUnread && (
                  <div ref={dividerRef} className="my-3 flex items-center gap-3" role="separator">
                    <span className="h-px flex-1 bg-primary/40" />
                    <span className="text-xs font-medium text-primary-ink">Novas mensagens</span>
                    <span className="h-px flex-1 bg-primary/40" />
                  </div>
                )}
                <MessageBubble
                  message={message}
                  spaced={!sameAsPrevious}
                  footer={
                    endsGroup ? (
                      <MessageFooter
                        time={message.time}
                        absolute={message.absolute}
                        seen={
                          message.id === lastMine?.id && other
                            ? Boolean(otherReadAt && message.createdAt <= otherReadAt)
                            : undefined
                        }
                      />
                    ) : null
                  }
                  onDelete={() => {
                    setDeleteTarget(message);
                    setDeleteOpen(true);
                  }}
                />
              </Fragment>
            );
          })
        )}
        {otherTyping && <TypingBubble name={conversation.title} />}
      </div>

      {canWrite ? (
        <ChatComposer
          conversationId={conversation.id}
          otherId={other!.id}
          otherName={conversation.title}
          uploadsEnabled={uploadsEnabled}
          onSent={() => {
            forceBottom.current = true;
          }}
        />
      ) : (
        <p className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
          {other ? "Essa pessoa foi desativada: a conversa fica só para leitura." : "Essa pessoa não está mais no Workboard."}
        </p>
      )}

      {deleteTarget && <DeleteChatMessageDialog open={deleteOpen} onOpenChange={setDeleteOpen} message={deleteTarget} />}
    </>
  );
}

function MessageBubble({
  message,
  spaced,
  footer,
  onDelete,
}: {
  message: ChatMessageView;
  spaced: boolean;
  footer: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group/message flex flex-col gap-1",
        message.mine ? "items-end" : "items-start",
        spaced ? "mt-3 first:mt-0" : "mt-0.5",
      )}
    >
      <div className={cn("flex max-w-[min(36rem,85%)] items-center gap-1", message.mine && "flex-row-reverse")}>
        <div className={cn("flex min-w-0 flex-col gap-1.5", message.mine ? "items-end" : "items-start")}>
          {message.text && (
            <p
              title={message.absolute}
              className={cn(
                "rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
                message.mine
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-muted text-foreground",
              )}
            >
              {/* No balão na cor de destaque, o link fica na cor do texto (sublinhado). */}
              <Linkified
                text={message.text}
                className={message.mine ? "break-all underline underline-offset-2" : undefined}
              />
            </p>
          )}
          {message.attachments.length > 0 && (
            <MessageAttachments
              attachments={message.attachments}
              className={message.mine ? "justify-end" : undefined}
            />
          )}
        </div>
        {message.mine && (
          <Hint label="Excluir mensagem">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Excluir mensagem"
              onClick={onDelete}
              className="shrink-0 text-muted-foreground opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100"
            >
              <Trash2Icon />
            </Button>
          </Hint>
        )}
      </div>
      {footer}
    </div>
  );
}

/** Hora do bloco e, na minha última mensagem, se a outra pessoa já viu. */
function MessageFooter({ time, absolute, seen }: { time: string; absolute: string; seen?: boolean }) {
  return (
    <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground" title={absolute}>
      {time}
      {seen !== undefined &&
        (seen ? (
          <span className="flex items-center gap-0.5 font-medium text-primary-ink">
            · <CheckCheckIcon aria-hidden="true" className="size-3.5" />
            Visto
          </span>
        ) : (
          <span className="flex items-center gap-0.5">
            · <CheckIcon aria-hidden="true" className="size-3.5" />
            Enviado
          </span>
        ))}
    </p>
  );
}

function TypingBubble({ name }: { name: string }) {
  return (
    <div className="mt-3 flex items-center gap-2" role="status" aria-label={`${name} está digitando`}>
      <span className="flex h-8 items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function ChatComposer({
  conversationId,
  otherId,
  otherName,
  uploadsEnabled,
  onSent,
}: {
  conversationId: string;
  otherId: string;
  otherName: string;
  uploadsEnabled: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSignal = useRef(0);
  const { files, readyIds, uploading, full, addFiles, removeFile, clearSent } = useAttachmentUploads({
    folder: "chat",
    enabled: uploadsEnabled,
    max: MESSAGE_ATTACHMENTS_MAX,
    discard: discardChatAttachment,
  });
  const canSend = !isPending && !uploading && (text.trim().length > 0 || readyIds.length > 0);

  function signalTyping() {
    const now = Date.now();
    if (now - lastSignal.current < TYPING_SIGNAL_MS) return;
    lastSignal.current = now;
    sendRealtime({ type: "typing", to: otherId });
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    const body = text.trim();
    const attachmentIds = readyIds;
    startTransition(async () => {
      const result = await sendChatMessage({ conversationId, body, attachmentIds });
      if (!result.ok) {
        toast.error(result.fieldErrors?.body?.[0] ?? result.error);
        return;
      }
      setText("");
      clearSent();
      lastSignal.current = 0;
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
      className={cn("shrink-0 border-t p-3 transition-colors", dragging && "bg-primary-soft/40")}
    >
      <div className="flex flex-col rounded-lg border border-input bg-background shadow-control transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 dark:bg-input/30">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b p-2">
            {files.map((file) => (
              <PendingFileChip key={file.localId} file={file} onRemove={() => removeFile(file)} />
            ))}
          </div>
        )}
        <div className="flex items-end gap-1 p-1.5">
          {uploadsEnabled && (
            <>
              <Hint label="Anexar arquivos">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Anexar arquivos"
                  className="mb-0.5 text-muted-foreground"
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
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (event.target.value.trim()) signalTyping();
            }}
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
              addFiles(pasted);
            }}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={`Mensagem para ${otherName.split(" ")[0]}`}
            aria-label="Mensagem"
            className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-base outline-none placeholder:text-muted-foreground/80 md:text-sm"
          />
          <Hint label="Enviar (Enter)">
            <Button type="submit" size="icon-sm" aria-label="Enviar" className="mb-0.5" disabled={!canSend}>
              {isPending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon />}
            </Button>
          </Hint>
        </div>
      </div>
    </form>
  );
}

function DeleteChatMessageDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChatMessageView;
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteChatMessage({ messageId: message.id });
      if (result.ok) {
        toast.success("Mensagem excluída.");
        onOpenChange(false);
      } else {
        toast.error(result.error);
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
              ? `A mensagem e ${message.attachments.length === 1 ? "o anexo saem" : `os ${message.attachments.length} anexos saem`} da conversa de vez, para as duas pessoas.`
              : "A mensagem sai da conversa de vez, para as duas pessoas."}
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
