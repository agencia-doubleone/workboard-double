"use client";

import {
  AlertCircleIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareIcon,
  PaperclipIcon,
  SendHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
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
import { MESSAGE_ATTACHMENTS_MAX, MESSAGE_MAX_LENGTH, mentionToken } from "@/lib/jobs";
import { formatBytes, getMediaType, MEDIA_ACCEPT } from "@/lib/media";
import { MediaUploadError, uploadMedia } from "@/lib/media-upload";
import { cn } from "@/lib/utils";
import { deleteMessage, discardAttachment, markJobRead, sendMessage } from "../actions";
import type { JobMessageView, JobPersonView } from "../types";

// Conversa do trabalho: mensagens com @menções e anexos. A página recarrega
// sozinha a cada POLL_MS (com a aba visível) para trazer mensagens novas, e
// cada carga marca a conversa como lida.

const POLL_MS = 15_000;
/** Mensagens seguidas da mesma pessoa dentro desse intervalo ficam agrupadas. */
const GROUP_MS = 5 * 60_000;

type JobMessagesProps = {
  jobId: string;
  messages: JobMessageView[];
  /** Equipe ativa, para @mencionar. */
  people: JobPersonView[];
  viewerId: string;
  /** Última leitura antes desta visita (ISO), para a linha de "novas mensagens". */
  lastReadAt: string | null;
  uploadsEnabled: boolean;
};

export function JobMessages({ jobId, messages, people, viewerId, lastReadAt, uploadsEnabled }: JobMessagesProps) {
  const router = useRouter();
  // A linha de novas fica onde estava ao abrir, mesmo depois de marcar como lida.
  const [readMark] = useState(lastReadAt);
  const [deleteTarget, setDeleteTarget] = useState<JobMessageView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const forceBottom = useRef(false);
  const mounted = useRef(false);

  const firstUnread = messages.findIndex(
    (message) => message.authorId !== viewerId && (!readMark || message.createdAt > readMark),
  );
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    void markJobRead({ jobId });
  }, [jobId, messages.length]);

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

  // Ao abrir: vai para a primeira não lida (ou para o fim). Depois, acompanha
  // as novas se a pessoa já estava no fim da conversa ou acabou de enviar.
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

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-raised">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
            <MessageSquareIcon className="size-5" />
          </span>
          <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Combine detalhes, peça aprovações e mande arquivos aqui. Use @ para chamar alguém.
          </p>
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
              previous?.authorId === message.authorId &&
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
                  viewerId={viewerId}
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
        jobId={jobId}
        people={people}
        viewerId={viewerId}
        uploadsEnabled={uploadsEnabled}
        onSent={() => {
          forceBottom.current = true;
        }}
      />

      {deleteTarget && <DeleteMessageDialog open={deleteOpen} onOpenChange={setDeleteOpen} message={deleteTarget} />}
    </div>
  );
}

function MessageItem({
  message,
  grouped,
  viewerId,
  onDelete,
}: {
  message: JobMessageView;
  grouped: boolean;
  viewerId: string;
  onDelete: () => void;
}) {
  const images = message.attachments.filter((file) => file.isImage);
  const files = message.attachments.filter((file) => !file.isImage);
  return (
    <div
      className={cn(
        "group/message relative flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted/40",
        !grouped && "mt-2 first:mt-0",
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <UserAvatar name={message.authorName} imageUrl={message.authorImageUrl} className="mt-0.5 size-8" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-8">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{message.authorName}</span>
            <Hint label={message.time.absolute}>
              <span className="shrink-0 text-xs text-muted-foreground">{message.time.label}</span>
            </Hint>
          </div>
        )}
        {message.parts.length > 0 && (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {message.parts.map((part, index) =>
              part.type === "mention" ? (
                <span
                  key={index}
                  className={cn(
                    "rounded-sm px-0.5 font-medium text-primary-ink",
                    part.userId === viewerId && "bg-primary-soft",
                  )}
                >
                  @{part.name}
                </span>
              ) : (
                <Linkified key={index} text={part.text} />
              ),
            )}
          </p>
        )}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="overflow-hidden rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                title={file.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arquivo do CDN */}
                <img src={file.url} alt={file.name} loading="lazy" className="max-h-48 max-w-64 object-cover" />
              </a>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex max-w-72 items-center gap-2.5 rounded-lg border bg-background px-3 py-2 shadow-control outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
              >
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{file.size}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
      {message.canDelete && (
        <Hint label="Excluir mensagem">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Excluir mensagem"
            onClick={onDelete}
            className="absolute top-1 right-1 text-muted-foreground opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100"
          >
            <Trash2Icon />
          </Button>
        </Hint>
      )}
    </div>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Texto com os endereços http(s) virando links. */
function Linkified({ text }: { text: string }) {
  const pieces = text.split(URL_PATTERN);
  return pieces.map((piece, index) => {
    if (index % 2 === 0) return <Fragment key={index}>{piece}</Fragment>;
    // Pontuação no fim ("veja https://x.com.") fica fora do link.
    const [, url, trailing] = piece.match(/^(.*?)([.,;:!?)\]]*)$/) ?? [piece, piece, ""];
    return (
      <Fragment key={index}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary-ink underline underline-offset-2"
        >
          {url}
        </a>
        {trailing}
      </Fragment>
    );
  });
}

type PendingFile = {
  localId: string;
  name: string;
  size: number;
  isImage: boolean;
  progress: number;
  status: "uploading" | "done" | "error";
  mediaId?: string;
  error?: string;
};

type Mention = { id: string; name: string };

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Quem combina com o que veio depois do @: começo do nome, depois começo de outra palavra, depois qualquer trecho. */
function rankPeople(people: JobPersonView[], query: string) {
  const term = normalize(query);
  return people
    .map((person) => {
      const name = normalize(person.name);
      const rank = name.startsWith(term) ? 0 : name.split(/\s+/).some((word) => word.startsWith(term)) ? 1 : name.includes(term) ? 2 : 3;
      return { person, rank };
    })
    .filter((item) => item.rank < 3)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6)
    .map((item) => item.person);
}

/** @ seguido do começo de um nome, logo antes do cursor. */
const MENTION_QUERY = /(?:^|\s)@([\p{L}\p{N}_.-]{0,30})$/u;

function Composer({
  jobId,
  people,
  viewerId,
  uploadsEnabled,
  onSent,
}: {
  jobId: string;
  people: JobPersonView[];
  viewerId: string;
  uploadsEnabled: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [suggest, setSuggest] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploads = useRef(new Map<string, AbortController>());

  const candidates = suggest ? rankPeople(people.filter((person) => person.id !== viewerId), suggest.query) : [];
  const uploading = files.some((file) => file.status === "uploading");
  const ready = files.filter((file) => file.status === "done");
  const canSend = !isPending && !uploading && (text.trim().length > 0 || ready.length > 0);

  function updateSuggest(value: string, caret: number) {
    const match = value.slice(0, caret).match(MENTION_QUERY);
    if (match) {
      setSuggest({ start: caret - match[1].length - 1, query: match[1] });
      setActive(0);
    } else {
      setSuggest(null);
    }
  }

  function pickMention(person: JobPersonView) {
    const element = textareaRef.current;
    if (!element || !suggest) return;
    const caret = element.selectionStart;
    const inserted = `@${person.name} `;
    const next = text.slice(0, suggest.start) + inserted + text.slice(caret);
    setText(next);
    setMentions((current) => (current.some((item) => item.id === person.id) ? current : [...current, person]));
    setSuggest(null);
    const position = suggest.start + inserted.length;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(position, position);
    });
  }

  function updateFile(localId: string, patch: Partial<PendingFile>) {
    setFiles((current) => current.map((file) => (file.localId === localId ? { ...file, ...patch } : file)));
  }

  function addFiles(list: File[]) {
    if (list.length === 0) return;
    if (!uploadsEnabled) {
      toast.error("O envio de arquivos não está configurado.");
      return;
    }
    const room = MESSAGE_ATTACHMENTS_MAX - files.length;
    if (room <= 0) {
      toast.error(`No máximo ${MESSAGE_ATTACHMENTS_MAX} anexos por mensagem.`);
      return;
    }
    if (list.length > room) toast.error(`No máximo ${MESSAGE_ATTACHMENTS_MAX} anexos por mensagem.`);
    for (const file of list.slice(0, room)) {
      const localId = crypto.randomUUID();
      const controller = new AbortController();
      uploads.current.set(localId, controller);
      setFiles((current) => [
        ...current,
        {
          localId,
          name: file.name,
          size: file.size,
          isImage: getMediaType(file.name)?.kind === "image",
          progress: 0,
          status: "uploading",
        },
      ]);
      uploadMedia(file, {
        folder: "trabalhos",
        signal: controller.signal,
        onProgress: (progress) => updateFile(localId, { progress }),
      })
        .then((item) => updateFile(localId, { status: "done", mediaId: item.id, progress: 1 }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          updateFile(localId, {
            status: "error",
            error: error instanceof MediaUploadError ? error.message : "Não foi possível enviar.",
          });
        })
        .finally(() => uploads.current.delete(localId));
    }
  }

  function removeFile(file: PendingFile) {
    uploads.current.get(file.localId)?.abort();
    setFiles((current) => current.filter((item) => item.localId !== file.localId));
    if (file.mediaId) void discardAttachment({ mediaId: file.mediaId });
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    // "@Nome" de quem foi escolhido na lista vira <@id>; nomes maiores primeiro
    // ("@Ana Paula" antes de "@Ana").
    let body = text.trim();
    for (const mention of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
      body = body.split(`@${mention.name}`).join(mentionToken(mention.id));
    }
    const attachmentIds = ready.map((file) => file.mediaId!);
    startTransition(async () => {
      const result = await sendMessage({ jobId, body, attachmentIds });
      if (!result.ok) {
        toast.error(result.fieldErrors?.body?.[0] ?? result.error);
        return;
      }
      setText("");
      setMentions([]);
      setFiles((current) => current.filter((file) => file.status !== "done"));
      onSent();
      textareaRef.current?.focus();
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (suggest && candidates.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(candidates[active] ?? candidates[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSuggest(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
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
      className={cn("relative border-t p-3 transition-colors", dragging && "bg-primary-soft/40")}
    >
      {suggest && candidates.length > 0 && (
        <div
          role="listbox"
          aria-label="Mencionar"
          className="absolute bottom-full left-3 z-10 mb-1 w-64 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-overlay"
        >
          {candidates.map((person, index) => (
            <div
              key={person.id}
              role="option"
              aria-selected={index === active}
              onPointerMove={() => setActive(index)}
              onPointerDown={(event) => {
                event.preventDefault();
                pickMention(person);
              }}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-6 text-[10px]" />
              <span className="truncate">{person.name}</span>
            </div>
          ))}
        </div>
      )}

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
          onChange={(event) => {
            setText(event.target.value);
            updateSuggest(event.target.value, event.target.selectionStart);
          }}
          onSelect={(event) => updateSuggest(event.currentTarget.value, event.currentTarget.selectionStart)}
          onBlur={() => setSuggest(null)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const pasted = [...event.clipboardData.files];
            if (pasted.length === 0) return;
            event.preventDefault();
            addFiles(pasted);
          }}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Escreva uma mensagem. Use @ para mencionar alguém."
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
                  disabled={files.length >= MESSAGE_ATTACHMENTS_MAX}
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
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Enter envia · Shift+Enter quebra a linha
          </span>
          <Button type="submit" size="sm" className="ml-auto" disabled={!canSend}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon data-icon="inline-start" />}
            Enviar
          </Button>
        </div>
      </div>
    </form>
  );
}

function PendingFileChip({ file, onRemove }: { file: PendingFile; onRemove: () => void }) {
  const Icon = file.status === "error" ? AlertCircleIcon : file.isImage ? ImageIcon : FileIcon;
  return (
    <span
      className={cn(
        "relative flex h-9 max-w-60 items-center gap-2 overflow-hidden rounded-md border bg-muted/40 pr-1 pl-2.5 text-xs",
        file.status === "error" && "border-destructive/40",
      )}
      title={file.error ?? file.name}
    >
      <Icon className={cn("size-3.5 shrink-0", file.status === "error" ? "text-destructive" : "text-muted-foreground")} />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate font-medium">{file.name}</span>
        <span className={cn("truncate", file.status === "error" ? "text-destructive-ink" : "text-muted-foreground")}>
          {file.status === "error"
            ? file.error
            : file.status === "uploading"
              ? `Enviando ${Math.round(file.progress * 100)}%`
              : formatBytes(file.size)}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover ${file.name}`}
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <XIcon className="size-3.5" />
      </button>
      {file.status === "uploading" && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-primary transition-[width]"
          style={{ width: `${Math.round(file.progress * 100)}%` }}
        />
      )}
    </span>
  );
}

function DeleteMessageDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: JobMessageView;
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteMessage({ messageId: message.id });
      if (result.ok) {
        toast.success(result.message);
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
              ? `A mensagem e ${message.attachments.length === 1 ? "o anexo saem" : `os ${message.attachments.length} anexos saem`} da conversa de vez.`
              : "A mensagem sai da conversa de vez."}
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
