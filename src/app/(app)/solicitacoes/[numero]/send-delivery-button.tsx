"use client";

import { AlertCircleIcon, Loader2Icon, SendIcon, UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { PendingFileChip, useAttachmentUploads } from "@/components/messages/attachment-uploads";
import { useSelectRequestTab } from "@/components/requests/request-tabs";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DELIVERY_FILES_MAX } from "@/lib/client-requests";
import { MEDIA_ACCEPT } from "@/lib/media";
import { cn } from "@/lib/utils";
import { discardRequestAttachment, sendDelivery } from "../actions";

/**
 * "Enviar para aprovação": os arquivos sobem na hora para o CDN (pasta
 * "solicitacoes"), com um recado em texto rico. Fechar sem mandar apaga do CDN
 * o que já tinha subido.
 */
export function SendDeliveryButton({
  requestId,
  code,
  nextRound,
  pendingRound,
  closedLabel,
  uploadsEnabled,
}: {
  requestId: string;
  /** "S-12". */
  code: string;
  nextRound: number;
  /** A rodada que ainda espera resposta (fica substituída). */
  pendingRound: number | null;
  /** Status que encerra (Finalizada, Negada, Cancelada): não dá para mandar. */
  closedLabel: string | null;
  uploadsEnabled: boolean;
}) {
  const selectTab = useSelectRequestTab();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploads = useAttachmentUploads({
    folder: "solicitacoes",
    enabled: uploadsEnabled,
    max: DELIVERY_FILES_MAX,
    discard: discardRequestAttachment,
    limitLabel: "arquivos por rodada",
  });

  function handleOpenChange(next: boolean) {
    if (!next && isPending) return;
    setOpen(next);
    if (!next) {
      // Fechou sem mandar: o que subiu sai do CDN.
      for (const file of uploads.files) uploads.removeFile(file);
      setNote("");
    }
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendDelivery({ requestId, note, mediaIds: uploads.readyIds }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Não foi possível mandar a entrega. Tente de novo.");
        return;
      }
      toast.success(result.message);
      uploads.clearSent();
      setNote("");
      setOpen(false);
      selectTab("entregas");
    });
  }

  const button = (
    <Button onClick={() => setOpen(true)} disabled={Boolean(closedLabel) || !uploadsEnabled}>
      <SendIcon data-icon="inline-start" />
      Enviar para aprovação
    </Button>
  );

  return (
    <>
      {closedLabel || !uploadsEnabled ? (
        <Hint label={closedLabel ? `A solicitação está "${closedLabel}": mude o status para mandar` : "O envio de arquivos não está configurado"}>
          <span tabIndex={0}>{button}</span>
        </Hint>
      ) : (
        button
      )}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar para aprovação</DialogTitle>
            <DialogDescription>
              Rodada {nextRound} de {code}. O cliente vê os arquivos no portal e aprova ou pede alteração em cada um.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            {pendingRound !== null && (
              <Alert>
                <AlertCircleIcon />
                <AlertDescription>
                  A rodada {pendingRound} ainda espera resposta: ao mandar esta, ela fica como substituída.
                </AlertDescription>
              </Alert>
            )}

            <div
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                uploads.addFiles(Array.from(event.dataTransfer.files));
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
                dragging ? "border-primary bg-primary-soft" : "bg-muted/30",
              )}
            >
              <UploadIcon className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Arraste os arquivos para cá ou</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploads.full || isPending}
                onClick={() => inputRef.current?.click()}
              >
                Escolher arquivos
              </Button>
              <p className="text-xs text-muted-foreground">Imagens, vídeos, PDFs e documentos. Até {DELIVERY_FILES_MAX} por rodada.</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={MEDIA_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  uploads.addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </div>

            {uploads.files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {uploads.files.map((file) => (
                  <PendingFileChip key={file.localId} file={file} onRemove={() => uploads.removeFile(file)} />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p id="delivery-note-label" className="text-sm font-medium">
                Recado para o cliente <span className="font-normal text-muted-foreground">(opcional)</span>
              </p>
              <RichTextEditor
                aria-labelledby="delivery-note-label"
                value={note}
                onChange={setNote}
                placeholder="Ex.: o que mudou desta vez, onde o material vai ser usado, o que observar..."
                disabled={isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={isPending || uploads.uploading || uploads.ready.length === 0}>
              {isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon data-icon="inline-start" />}
              {uploads.ready.length > 0
                ? `Enviar ${uploads.ready.length === 1 ? "1 arquivo" : `${uploads.ready.length} arquivos`}`
                : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
