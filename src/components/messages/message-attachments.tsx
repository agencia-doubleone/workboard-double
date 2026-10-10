import { FileIcon } from "lucide-react";

import type { AttachmentView } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Anexos de uma mensagem: imagens em miniatura e os outros arquivos como cartões. */
export function MessageAttachments({
  attachments,
  className,
}: {
  attachments: AttachmentView[];
  /** Ex.: "justify-end" para as mensagens da própria pessoa no chat. */
  className?: string;
}) {
  const images = attachments.filter((file) => file.isImage);
  const files = attachments.filter((file) => !file.isImage);
  return (
    <>
      {images.length > 0 && (
        <div className={cn("flex flex-wrap gap-2", className)}>
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
        <div className={cn("flex flex-wrap gap-2", className)}>
          {files.map((file) => (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-72 items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-foreground shadow-control outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
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
    </>
  );
}
