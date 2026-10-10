"use client";

import { AlertCircleIcon, FileIcon, ImageIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { formatBytes, getMediaType, type MediaFolder } from "@/lib/media";
import { MediaUploadError, uploadMedia } from "@/lib/media-upload";
import { cn } from "@/lib/utils";

// Anexos do compositor de mensagens (trabalhos e chat): cada arquivo sobe na
// hora para o CDN; tirar do rascunho apaga do CDN (discard).

export type PendingFile = {
  localId: string;
  name: string;
  size: number;
  isImage: boolean;
  progress: number;
  status: "uploading" | "done" | "error";
  mediaId?: string;
  error?: string;
};

type Options = {
  folder: MediaFolder;
  enabled: boolean;
  max: number;
  /** Server Action que apaga do CDN um anexo enviado e tirado do rascunho. */
  discard: (input: { mediaId: string }) => Promise<unknown>;
};

export function useAttachmentUploads({ folder, enabled, max, discard }: Options) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const uploads = useRef(new Map<string, AbortController>());

  function updateFile(localId: string, patch: Partial<PendingFile>) {
    setFiles((current) => current.map((file) => (file.localId === localId ? { ...file, ...patch } : file)));
  }

  function addFiles(list: File[]) {
    if (list.length === 0) return;
    if (!enabled) {
      toast.error("O envio de arquivos não está configurado.");
      return;
    }
    const room = max - files.length;
    if (room <= 0 || list.length > room) toast.error(`No máximo ${max} anexos por mensagem.`);
    for (const file of list.slice(0, Math.max(0, room))) {
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
        folder,
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
    if (file.mediaId) void discard({ mediaId: file.mediaId });
  }

  const ready = files.filter((file) => file.status === "done");
  return {
    files,
    ready,
    readyIds: ready.map((file) => file.mediaId!),
    uploading: files.some((file) => file.status === "uploading"),
    full: files.length >= max,
    addFiles,
    removeFile,
    /** Depois de enviar: tira do rascunho os anexos que foram na mensagem. */
    clearSent: () => setFiles((current) => current.filter((file) => file.status !== "done")),
  };
}

export function PendingFileChip({ file, onRemove }: { file: PendingFile; onRemove: () => void }) {
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
