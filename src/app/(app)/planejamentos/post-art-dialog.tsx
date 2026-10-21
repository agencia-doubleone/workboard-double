"use client";

import { Loader2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { keepValidArt, POST_KINDS } from "@/lib/planning";
import { savePostArt } from "./actions";
import { PostArtSection, useArtDrafts } from "./post-art-editor";
import { ConfirmSave, type Confirmation } from "./post-editor";
import type { PostView } from "./types";

/**
 * Só as artes de um post, pelo botão "Adicionar arte" do card (sem abrir o
 * editor inteiro). As mesmas regras do editor: o que subiu e não foi salvo sai
 * do CDN, e trocar uma arte aprovada pede confirmação.
 */
export function PostArtDialog({
  open,
  onOpenChange,
  post,
  isAdmin,
  uploadsEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: PostView;
  isAdmin: boolean;
  uploadsEnabled: boolean;
}) {
  const art = useArtDrafts(post.art);
  const kept = keepValidArt(post.kind, art.items);
  const list = kept.flatMap((item) => (item.status === "done" && item.mediaId ? [{ mediaId: item.mediaId, role: item.role }] : []));
  const changed = JSON.stringify(list) !== JSON.stringify(post.art.map(({ mediaId, role }) => ({ mediaId, role })));
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [isPending, startTransition] = useTransition();
  const saved = useRef(false);

  function close(next: boolean) {
    // Fechou sem salvar: o que subiu agora sai do CDN.
    if (!next && !saved.current) art.discardFresh();
    onOpenChange(next);
  }

  function save(approval?: "keep" | "drop") {
    setConfirmation(null);
    startTransition(async () => {
      const result = await savePostArt({
        postId: post.id,
        art: list,
        approval,
      }).catch(() => null);
      if (result && !result.ok && result.needsApproval) {
        setConfirmation({ stages: result.needsApproval, droppedArt: 0 });
        return;
      }
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível salvar as artes.");
        return;
      }
      saved.current = true;
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // O Esc de um arrasto de arte cancela só o arrasto.
        if (!next && details.reason === "escape-key" && art.isDragging()) {
          details.cancel();
          return;
        }
        close(next);
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Artes do post</DialogTitle>
          <DialogDescription className="truncate">
            {post.dateLabel ?? "Sem data"} · {POST_KINDS[post.kind].label} · {post.headline || "Sem headline"}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-5 min-h-0 overflow-y-auto px-5 pb-1">
          <PostArtSection kind={post.kind} drafts={art} dropped={[]} uploadsEnabled={uploadsEnabled} locked={null} heading={false} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => save()} disabled={isPending || art.uploading || !changed}>
            {(isPending || art.uploading) && <Loader2Icon className="animate-spin" />}
            {art.uploading ? "Enviando as artes..." : "Salvar artes"}
          </Button>
        </DialogFooter>
        <ConfirmSave
          confirmation={confirmation}
          isAdmin={isAdmin}
          kindLabel={POST_KINDS[post.kind].label}
          onCancel={() => setConfirmation(null)}
          onConfirm={(approval) => save(approval)}
        />
      </DialogContent>
    </Dialog>
  );
}
