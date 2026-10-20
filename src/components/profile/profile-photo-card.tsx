"use client";

import { ImageUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { AVATAR_ACCEPT, prepareAvatar } from "@/lib/avatar-image";
import { MediaUploadError } from "@/lib/media-upload";
import { cn } from "@/lib/utils";

type PhotoResult = { ok: true; message: string } | { ok: false; error: string };

type ProfilePhotoCardProps = {
  name: string;
  imageUrl: string | null;
  uploadsEnabled: boolean;
  /** Envia a foto já preparada (quadrada, pequena) ao CDN e grava no perfil. */
  onUpload: (photo: File, onProgress: (progress: number) => void) => Promise<PhotoResult>;
  onRemove: () => Promise<PhotoResult>;
};

/**
 * Card da foto do perfil (equipe e portal do cliente): enviar, trocar (também
 * arrastando a imagem) e remover, com prévia e progresso. Quem usa decide para
 * onde a foto vai (onUpload) e de onde sai (onRemove).
 */
export function ProfilePhotoCard({ name, imageUrl: savedUrl, uploadsEnabled, onUpload, onRemove }: ProfilePhotoCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<number | null>(null);
  // Prévia local enquanto envia (e depois, até a página sair: é a mesma imagem).
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = isPending || progress !== null;
  const imageUrl = preview ?? savedUrl;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function handleFile(file: File | undefined) {
    if (!file || busy || !uploadsEnabled) return;
    startTransition(async () => {
      try {
        const photo = await prepareAvatar(file);
        setPreview(URL.createObjectURL(photo));
        setProgress(0);
        const result = await onUpload(photo, setProgress);
        if (!result.ok) throw new MediaUploadError(result.error);
        toast.success(result.message);
      } catch (error) {
        setPreview(null);
        toast.error(error instanceof MediaUploadError ? error.message : "Não foi possível enviar a foto.");
      } finally {
        setProgress(null);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await onRemove();
      if (result.ok) {
        setPreview(null);
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className={cn(
            "relative w-fit shrink-0 rounded-2xl outline-offset-4 transition-[outline-color]",
            dragging ? "outline-2 outline-dashed outline-ring" : "outline-2 outline-transparent",
          )}
          onDragOver={(event) => {
            if (!uploadsEnabled || busy) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFile(event.dataTransfer.files[0]);
          }}
        >
          <UserAvatar
            name={name}
            imageUrl={imageUrl}
            alt={`Foto de ${name}`}
            className="size-20 rounded-2xl"
            fallbackClassName="text-xl"
          />
          {busy && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/75 text-xs font-medium tabular-nums">
              {progress !== null && progress < 1 ? (
                `${Math.round(progress * 100)}%`
              ) : (
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={!uploadsEnabled || busy}
            >
              <ImageUpIcon />
              {savedUrl ? "Trocar foto" : "Enviar foto"}
            </Button>
            {savedUrl && (
              <Button variant="destructive" onClick={handleRemove} disabled={busy}>
                <Trash2Icon />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {uploadsEnabled
              ? "JPG, PNG ou WebP, até 20 MB. Recortada no centro, em quadrado. Também dá para arrastar a imagem até a foto."
              : "O envio de fotos ainda não está configurado no servidor."}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
