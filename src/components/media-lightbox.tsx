"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ScanIcon,
  ShrinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type LightboxItem = { id: string; url: string; name: string; kind: "image" | "video" };

/**
 * Imagens e vídeos em tamanho grande, num dialog: anterior e próximo pelos
 * botões ou pelas setas do teclado, zoom nas imagens, o link para abrir em
 * outra aba e, se vier, um rodapé por item (ex.: aprovar ou pedir alteração
 * sem sair da imagem).
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  renderFooter,
}: {
  items: LightboxItem[];
  /** O item aberto; null fecha. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  renderFooter?: (item: LightboxItem) => React.ReactNode;
}) {
  // Enquanto o dialog some (animação de saída), continua mostrando o último item.
  const [shownIndex, setShownIndex] = useState(index);
  if (index !== null && index !== shownIndex) setShownIndex(index);
  const visible = index ?? shownIndex;
  const item = visible === null ? null : (items[visible] ?? null);
  const open = index !== null && items[index] !== undefined;
  const many = items.length > 1;

  function go(step: number) {
    if (index === null) return;
    onIndexChange((index + step + items.length) % items.length);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogContent
        className="flex h-[min(92vh,60rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,80rem)]"
        onKeyDown={(event) => {
          // As setas de um vídeo ou de um campo de texto continuam deles.
          const target = event.target as HTMLElement;
          if (!many || target.closest("video, textarea, input")) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            go(1);
          }
        }}
      >
        {item && visible !== null && (
          <>
            <div className="flex items-center gap-3 border-b py-3 pr-14 pl-4">
              <div className="grid min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-medium">{item.name}</DialogTitle>
                <DialogDescription className="text-xs">
                  {many ? `${visible + 1} de ${items.length}` : item.kind === "image" ? "Imagem" : "Vídeo"}
                  {item.kind === "image" ? " · roda do mouse ou duplo clique para o zoom" : ""}
                </DialogDescription>
              </div>
              <Hint label="Abrir em outra aba">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${item.name} em outra aba`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ExternalLinkIcon className="size-4" />
                </a>
              </Hint>
            </div>

            <div className="relative flex min-h-0 flex-1 bg-muted/40">
              {item.kind === "image" ? (
                // Zoom novo a cada imagem.
                <ZoomableImage key={item.id} src={item.url} alt={item.name} />
              ) : (
                <div className="flex size-full items-center justify-center p-3 sm:px-16">
                  <video key={item.id} src={item.url} controls autoPlay className="max-h-full max-w-full" />
                </div>
              )}
              {many && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Anterior"
                    onClick={() => go(-1)}
                    className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full"
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Próximo"
                    onClick={() => go(1)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full"
                  >
                    <ChevronRightIcon />
                  </Button>
                </>
              )}
            </div>

            {renderFooter && <div className="border-t px-4 py-3">{renderFooter(item)}</div>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };
const STEP = 1.5;

/**
 * Imagem com zoom: começa ajustada à área (escala 1) e aproxima pela roda do
 * mouse (no ponto do cursor), duplo clique, pinça no celular, teclas + - 0 e
 * pela barra embaixo. Aproximada, arrasta para mover. O zoom vai até o dobro
 * do tamanho real da imagem (no mínimo 4x).
 */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(FIT);
  const [dragging, setDragging] = useState(false);
  /** Tamanho ajustado e real da imagem (para o "%" e o "tamanho real"). */
  const [size, setSize] = useState<{ fit: number; natural: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  function maxScale() {
    return size ? Math.max(4, (size.natural / size.fit) * 2) : 4;
  }

  /** Mantém a imagem cobrindo a área quando ela é maior (não some pelos lados). */
  function clamp(next: View): View {
    const frame = frameRef.current;
    const image = imageRef.current;
    const scale = Math.min(maxScale(), Math.max(1, next.scale));
    if (!frame || !image || scale === 1) return FIT;
    const maxX = Math.max(0, (image.offsetWidth * scale - frame.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - frame.clientHeight) / 2);
    return { scale, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  /** Muda a escala mantendo parado o ponto da tela em (clientX, clientY) (o centro, sem ponto). */
  function zoomTo(nextScale: (current: number) => number, clientX?: number, clientY?: number) {
    setView((current) => {
      const frame = frameRef.current;
      if (!frame) return current;
      const rect = frame.getBoundingClientRect();
      const px = clientX === undefined ? 0 : clientX - (rect.left + rect.width / 2);
      const py = clientY === undefined ? 0 : clientY - (rect.top + rect.height / 2);
      const scale = Math.min(maxScale(), Math.max(1, nextScale(current.scale)));
      const ratio = scale / current.scale;
      return clamp({ scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio });
    });
  }

  // A roda do mouse precisa de um ouvinte não passivo para não rolar a página.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomTo((current) => current * factor, event.clientX, event.clientY);
  });
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("textarea, input")) return;
    if (event.key === "+" || event.key === "=") zoomTo((current) => current * STEP);
    else if (event.key === "-") zoomTo((current) => current / STEP);
    else if (event.key === "0") setView(FIT);
  });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const wheel = (event: WheelEvent) => onWheel(event);
    const key = (event: KeyboardEvent) => onKey(event);
    frame.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    return () => {
      frame.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
    };
  }, []);

  function handlePointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    } else {
      setDragging(view.scale > 1);
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      // Pinça: a escala acompanha a distância entre os dedos, no meio deles.
      const [a, b] = [...pointers.current.values()];
      const start = pinch.current;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(() => (start.scale * distance) / Math.max(start.distance, 1), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (view.scale > 1) {
      setView((current) => clamp({ ...current, x: current.x + event.clientX - previous.x, y: current.y + event.clientY - previous.y }));
    }
  }

  function handlePointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }

  const percent = size ? Math.round(((size.fit * view.scale) / size.natural) * 100) : Math.round(view.scale * 100);
  const realScale = size ? size.natural / size.fit : null;

  return (
    <div
      ref={frameRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(event) => {
        if (view.scale > 1) setView(FIT);
        else zoomTo(() => Math.max(2.5, realScale ?? 0), event.clientX, event.clientY);
      }}
      className={cn(
        "relative flex size-full touch-none items-center justify-center overflow-hidden p-3 select-none sm:px-16",
        view.scale > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arquivo do CDN */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          setSize({ fit: image.offsetWidth || 1, natural: image.naturalWidth || image.offsetWidth || 1 });
        }}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        className={cn("max-h-full max-w-full object-contain will-change-transform", !dragging && "transition-transform duration-150 ease-out")}
      />

      <div
        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover/95 p-0.5 shadow-overlay"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Hint label="Diminuir (-)">
          <Button variant="ghost" size="icon-sm" aria-label="Diminuir o zoom" disabled={view.scale <= 1} onClick={() => zoomTo((current) => current / STEP)}>
            <ZoomOutIcon />
          </Button>
        </Hint>
        <span className="w-12 text-center text-xs font-medium tabular-nums" aria-live="polite">
          {percent}%
        </span>
        <Hint label="Aumentar (+)">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Aumentar o zoom"
            disabled={view.scale >= maxScale()}
            onClick={() => zoomTo((current) => current * STEP)}
          >
            <ZoomInIcon />
          </Button>
        </Hint>
        {realScale !== null && realScale > 1 && (
          <Hint label="Tamanho real (100%)">
            <Button variant="ghost" size="icon-sm" aria-label="Ver no tamanho real" onClick={() => zoomTo(() => realScale)}>
              <ScanIcon />
            </Button>
          </Hint>
        )}
        <Hint label="Ajustar à tela (0)">
          <Button variant="ghost" size="icon-sm" aria-label="Ajustar à tela" disabled={view.scale === 1} onClick={() => setView(FIT)}>
            <ShrinkIcon />
          </Button>
        </Hint>
      </div>
    </div>
  );
}
