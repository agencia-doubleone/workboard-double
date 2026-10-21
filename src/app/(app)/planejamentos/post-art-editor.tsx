"use client";

import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircleIcon, ImageIcon, ImagePlusIcon, Loader2Icon, PlayIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";
import { Button } from "@/components/ui/button";
import { MediaUploadError, uploadMedia } from "@/lib/media-upload";
import {
  ART_ACCEPT,
  artMediaKind,
  isRiskyVideo,
  POST_ART_RULES,
  POST_KINDS,
  type ArtMediaKind,
  type ArtRole,
  type PostKind,
} from "@/lib/planning";
import { cn } from "@/lib/utils";
import { sheetAccessibility, useSheetSensors } from "../trabalhos/sheet-dnd";
import { discardArtUpload } from "./actions";
import type { ArtItemView } from "./types";

// A seção "Artes" do editor de post: cada arquivo sobe na hora para o CDN
// (pasta "planejamentos") e só entra no post ao salvar. Tirar um arquivo que
// subiu agora apaga do CDN; tirar um que já estava no post só vale ao salvar.

export type ArtDraft = {
  localId: string;
  mediaId: string | null;
  /** O link do CDN ou, enquanto sobe, a prévia local. */
  url: string | null;
  name: string;
  kind: ArtMediaKind;
  role: ArtRole;
  status: "done" | "uploading" | "error";
  progress: number;
  error?: string;
  /** Subiu neste editor (ainda não está no post): sai do CDN se não for salva. */
  fresh: boolean;
};

export function toArtDrafts(art: ArtItemView[]): ArtDraft[] {
  return art.map((item) => ({ ...item, localId: item.mediaId, status: "done", progress: 1, fresh: false }));
}

/** As artes em edição: envio, remoção e ordem. */
export function useArtDrafts(initial: ArtItemView[]) {
  const [items, setItems] = useState(() => toArtDrafts(initial));
  const uploads = useRef(new Map<string, AbortController>());
  // Arrasto em andamento (ou que acabou agora): o Esc que cancela o arrasto não fecha o editor.
  const drag = useRef({ active: false, endedAt: 0 });
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const controllers = uploads.current;
    const urls = previews.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  function update(localId: string, patch: Partial<ArtDraft>) {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function upload(file: File, role: ArtRole, kind: ArtMediaKind) {
    const localId = crypto.randomUUID();
    const controller = new AbortController();
    uploads.current.set(localId, controller);
    const preview = URL.createObjectURL(file);
    previews.current.add(preview);
    const draft: ArtDraft = { localId, mediaId: null, url: preview, name: file.name, kind, role, status: "uploading", progress: 0, fresh: true };
    uploadMedia(file, { folder: "planejamentos", signal: controller.signal, onProgress: (progress) => update(localId, { progress }) })
      .then((item) => update(localId, { status: "done", mediaId: item.id, url: item.url, progress: 1 }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        update(localId, { status: "error", error: error instanceof MediaUploadError ? error.message : "Não foi possível enviar." });
      })
      .finally(() => uploads.current.delete(localId));
    return draft;
  }

  function discard(item: ArtDraft) {
    uploads.current.get(item.localId)?.abort();
    if (item.fresh && item.mediaId) void discardArtUpload({ mediaId: item.mediaId }).catch(() => null);
  }

  /**
   * Adiciona arquivos, conferindo formato e limite do tipo: a arte entra no fim
   * da lista (com `replace`, troca as que havia); a capa troca a anterior.
   */
  function add(postKind: PostKind, list: File[], role: ArtRole, { replace = false } = {}) {
    const rules = POST_ART_RULES[postKind];
    const accepted: { file: File; kind: ArtMediaKind }[] = [];
    for (const file of list) {
      const kind = artMediaKind(file.name);
      const allowed: readonly ArtMediaKind[] = role === "cover" ? ["image"] : rules.accepts;
      if (!kind || !allowed.includes(kind)) {
        toast.error(`"${file.name}" não serve aqui: ${role === "cover" ? "a capa é uma imagem (JPG, PNG ou WebP)" : rules.label.toLowerCase()}.`);
        continue;
      }
      if (isRiskyVideo(file.name)) toast.warning(`"${file.name}" é .mov: sobe, mas nem todo navegador toca. Prefira MP4.`);
      accepted.push({ file, kind });
    }

    const replacing = replace || role === "cover";
    const existing = items.filter((item) => item.role === role);
    const max = role === "cover" ? 1 : rules.max;
    const room = max - (replacing ? 0 : existing.length);
    if (role === "art" && accepted.length > room) {
      toast.error(`${POST_KINDS[postKind].label}: no máximo ${rules.max} ${rules.max === 1 ? "arte" : "artes"}.`);
    }
    const chosen = accepted.slice(0, Math.max(0, room));
    if (chosen.length === 0) return;

    const replaced = new Set(replacing ? existing.map((item) => item.localId) : []);
    if (replacing) existing.forEach(discard);
    const added = chosen.map(({ file, kind }) => upload(file, role, kind));
    setItems((current) => {
      const rest = current.filter((item) => !replaced.has(item.localId));
      if (role === "cover") return [...rest, ...added];
      return [...rest.filter((item) => item.role === "art"), ...added, ...rest.filter((item) => item.role !== "art")];
    });
  }

  function remove(item: ArtDraft) {
    discard(item);
    setItems((current) => current.filter((candidate) => candidate.localId !== item.localId));
  }

  function move(from: string, to: string) {
    setItems((current) => {
      const art = current.filter((item) => item.role === "art");
      const oldIndex = art.findIndex((item) => item.localId === from);
      const newIndex = art.findIndex((item) => item.localId === to);
      if (oldIndex < 0 || newIndex < 0) return current;
      return [...arrayMove(art, oldIndex, newIndex), ...current.filter((item) => item.role !== "art")];
    });
  }

  /** Ao fechar sem salvar: apaga do CDN o que subiu agora. */
  function discardFresh() {
    items.filter((item) => item.fresh).forEach(discard);
  }

  return {
    items,
    add,
    remove,
    move,
    discardFresh,
    discard,
    startDrag: () => {
      drag.current = { active: true, endedAt: 0 };
    },
    endDrag: () => {
      drag.current = { active: false, endedAt: Date.now() };
    },
    /** Um arrasto está em andamento ou acabou de ser cancelado. */
    isDragging: () => drag.current.active || Date.now() - drag.current.endedAt < 300,
    uploading: items.some((item) => item.status === "uploading"),
    failed: items.some((item) => item.status === "error"),
  };
}

export type ArtDrafts = ReturnType<typeof useArtDrafts>;

/** A seção "Artes" do editor, conforme o tipo do post. */
export function PostArtSection({
  kind,
  drafts,
  dropped,
  uploadsEnabled,
  locked,
  heading = true,
}: {
  kind: PostKind;
  drafts: ArtDrafts;
  /** Artes que saem ao salvar porque não valem para o tipo escolhido. */
  dropped: ArtDraft[];
  uploadsEnabled: boolean;
  /** Por que a arte ainda não pode subir (pauta não aprovada), com a ação para resolver. */
  locked: React.ReactNode | null;
  /** O título "Artes" (no dialog só das artes, o título do dialog já diz). */
  heading?: boolean;
}) {
  const rules = POST_ART_RULES[kind];
  const art = drafts.items.filter((item) => item.role === "art" && !dropped.includes(item));
  const cover = drafts.items.find((item) => item.role === "cover" && !dropped.includes(item)) ?? null;
  const [lightbox, setLightbox] = useState<number | null>(null);
  const shown = [...art, ...(cover ? [cover] : [])].filter((item) => item.status === "done" && item.url);
  const lightboxItems: LightboxItem[] = shown.map((item) => ({ id: item.localId, url: item.url!, name: item.name, kind: item.kind }));
  const canAdd = uploadsEnabled && !locked;
  const sensors = useSheetSensors();
  const accessibility = sheetAccessibility((id) => `arte ${art.findIndex((item) => item.localId === id) + 1}`, "arquivo");

  function open(item: ArtDraft) {
    const index = shown.indexOf(item);
    if (index >= 0) setLightbox(index);
  }

  function handleDragEnd(event: DragEndEvent) {
    drafts.endDrag();
    if (event.over && event.active.id !== event.over.id) drafts.move(String(event.active.id), String(event.over.id));
  }

  // No estático, no Reels e no vídeo a arte é uma só: o arquivo novo troca o anterior.
  const addArt = (files: File[]) => drafts.add(kind, files, "art", { replace: rules.max === 1 });
  const full = rules.max > 1 && art.length >= rules.max;
  const ruleText = `${POST_KINDS[kind].label}: ${rules.label.toLowerCase()}.`;

  return (
    <div className="flex flex-col gap-3">
      {heading && (
        <div className="grid gap-0.5">
          <span className="text-sm font-medium">Artes</span>
          <span className="text-xs text-muted-foreground">{ruleText}</span>
        </div>
      )}

      {locked}
      {!uploadsEnabled && !locked && (
        <p className="text-xs text-muted-foreground">O envio de arquivos não está configurado neste ambiente.</p>
      )}

      {art.length === 0 ? (
        canAdd && (
          <DropZone
            variant="area"
            title="Adicionar arte"
            hint={heading ? null : ruleText}
            accept={ART_ACCEPT}
            multiple={rules.max > 1}
            onFiles={addArt}
          />
        )
      ) : (
        <div className="flex flex-col gap-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={drafts.startDrag}
            onDragEnd={handleDragEnd}
            onDragCancel={drafts.endDrag}
            accessibility={accessibility}
          >
            <SortableContext items={art.map((item) => item.localId)} strategy={rectSortingStrategy}>
              <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {art.map((item, index) => (
                  <SortableArtTile
                    key={item.localId}
                    item={item}
                    index={art.length > 1 ? index + 1 : null}
                    sortable={rules.max > 1 && art.length > 1}
                    onOpen={() => open(item)}
                    onRemove={() => drafts.remove(item)}
                  />
                ))}
                {canAdd && !full && (
                  <li>
                    <DropZone
                      variant="tile"
                      title={rules.max === 1 ? "Trocar" : "Adicionar"}
                      accept={ART_ACCEPT}
                      multiple={rules.max > 1}
                      onFiles={addArt}
                    />
                  </li>
                )}
              </ol>
            </SortableContext>
          </DndContext>
          {(art.length > 1 || !heading) && (
            <p className="text-xs text-muted-foreground">
              {!heading && `${ruleText} `}
              {art.length > 1 && "Arraste para mudar a ordem."}
            </p>
          )}
        </div>
      )}

      {rules.cover && (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          <div className="w-20 shrink-0">
            {cover ? (
              <ArtTile item={cover} onOpen={() => open(cover)} onRemove={() => drafts.remove(cover)} />
            ) : canAdd ? (
              <DropZone
                variant="tile"
                title="Capa"
                accept=".jpg,.jpeg,.png,.webp"
                onFiles={(files) => drafts.add(kind, files.slice(0, 1), "cover")}
              />
            ) : (
              <span className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                <ImageIcon className="size-5" />
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Capa</span>
            <span className="text-xs text-muted-foreground">A imagem que aparece no feed antes do vídeo tocar.</span>
          </div>
          {canAdd && cover && (
            <FileButton label="Trocar" accept=".jpg,.jpeg,.png,.webp" onFiles={(files) => drafts.add(kind, files.slice(0, 1), "cover")} />
          )}
        </div>
      )}

      {dropped.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/14 px-3 py-2 text-xs text-warning-ink dark:bg-warning/16">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          {dropped.length === 1
            ? `Ao salvar, "${dropped[0].name}" sai do post: não vale para ${POST_KINDS[kind].label}.`
            : `Ao salvar, ${dropped.length} artes saem do post: não valem para ${POST_KINDS[kind].label}.`}
        </p>
      )}

      <MediaLightbox items={lightboxItems} index={lightbox} onIndexChange={setLightbox} />
    </div>
  );
}

/**
 * Onde a arte entra: clicar abre o seletor de arquivos, e dá para soltar os
 * arquivos arrastados do computador. "area": o espaço grande do post sem arte;
 * "tile": o bloco no fim da grade (ou da capa).
 */
function DropZone({
  variant,
  title,
  hint = null,
  accept,
  multiple = false,
  onFiles,
}: {
  variant: "area" | "tile";
  title: string;
  hint?: string | null;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const files = Array.from(event.dataTransfer.files);
          if (files.length) onFiles(multiple ? files : files.slice(0, 1));
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 border border-dashed text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          variant === "area" ? "rounded-lg px-4 py-8 text-center" : "aspect-[4/5] rounded-md",
          over && "border-primary bg-primary-soft/40 text-foreground",
        )}
      >
        <ImagePlusIcon className={variant === "area" ? "size-6" : "size-4"} />
        {variant === "area" ? (
          <>
            <span className="text-sm font-medium text-foreground">{title}</span>
            {hint && <span className="text-xs">{hint}</span>}
            <span className="text-xs">Clique ou arraste {multiple ? "os arquivos" : "o arquivo"} aqui.</span>
          </>
        ) : (
          <span className="text-[11px] font-medium">{title}</span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

function FileButton({
  label,
  accept,
  multiple = false,
  disabled = false,
  onFiles,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={disabled}>
        <ImagePlusIcon data-icon="inline-start" />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

function SortableArtTile({
  item,
  index,
  sortable,
  onOpen,
  onRemove,
}: {
  item: ArtDraft;
  index: number | null;
  sortable: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.localId, disabled: !sortable });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-80")}
      {...(sortable ? attributes : {})}
      {...(sortable ? listeners : {})}
    >
      <ArtTile item={item} index={index} onOpen={onOpen} onRemove={onRemove} />
    </li>
  );
}

/** A miniatura de uma arte: imagem ou vídeo (com o ícone de play), com o envio e o botão de tirar. */
export function ArtTile({
  item,
  index = null,
  onOpen,
  onRemove,
}: {
  item: Pick<ArtDraft, "url" | "name" | "kind" | "status" | "progress" | "error">;
  index?: number | null;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "group/art relative aspect-[4/5] overflow-hidden rounded-md border bg-muted",
        item.status === "error" && "border-destructive/50",
      )}
      title={item.error ?? item.name}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={item.status !== "done"}
        aria-label={`Ver ${item.name}`}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {item.url && item.status !== "error" ? (
          item.kind === "video" ? (
            <video src={item.url} muted playsInline preload="metadata" className="size-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" className="size-full object-cover" />
          )
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-destructive-ink">
            <AlertCircleIcon className="size-4" />
            {item.error ?? "Não foi possível enviar."}
          </span>
        )}
      </button>
      {item.kind === "video" && item.status === "done" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white">
            <PlayIcon className="size-4 fill-current" />
          </span>
        </span>
      )}
      {index !== null && (
        <span className="pointer-events-none absolute top-1 left-1 flex size-5 items-center justify-center rounded bg-black/55 text-[11px] font-semibold text-white tabular-nums">
          {index}
        </span>
      )}
      {item.status === "uploading" && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 text-xs font-medium">
          <Loader2Icon className="size-4 animate-spin" />
          {Math.round(item.progress * 100)}%
        </span>
      )}
      {onRemove && (
        <Hint label="Tirar do post">
          <button
            type="button"
            onClick={onRemove}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Tirar ${item.name}`}
            className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-md bg-black/55 text-white opacity-100 outline-none transition-opacity hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-ring/50 sm:opacity-0 sm:group-hover/art:opacity-100 sm:focus-visible:opacity-100"
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      )}
    </div>
  );
}
