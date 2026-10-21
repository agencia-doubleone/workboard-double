import { HistoryIcon } from "lucide-react";

import { POST_KINDS, SOCIAL_NETWORKS } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { KIND_ICONS, NetworkIcon } from "./planning-icons";
import type { PlanningPostView } from "./types";

// Pedaços de um post como o cliente vê, comuns à apresentação e ao feed.

/** Data, rede e formato, numa linha discreta. */
export function PostMeta({ post, className }: { post: PlanningPostView; className?: string }) {
  const KindIcon = KIND_ICONS[post.kind];
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="font-medium text-foreground tabular-nums">{post.dateLabel ?? "Sem data"}</span>
      {post.network && (
        <span className="flex items-center gap-1">
          <NetworkIcon network={post.network} />
          {SOCIAL_NETWORKS[post.network]}
        </span>
      )}
      <span className="flex items-center gap-1">
        <KindIcon className="size-3.5" />
        {POST_KINDS[post.kind].label}
        {post.stage === "arte" && post.kind === "carrossel" && ` · ${post.art.filter((item) => item.role === "art").length} imagens`}
      </span>
    </p>
  );
}

/** A legenda: copy, CTA e hashtags (o que vai publicado com a arte). */
export function PostCaption({ post, className }: { post: PlanningPostView; className?: string }) {
  if (!post.copy && !post.cta && post.hashtags.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Sem legenda.</p>;
  }
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>
      {post.copy && <p className="whitespace-pre-wrap">{post.copy}</p>}
      {post.cta && <p className="font-medium whitespace-pre-line">{post.cta}</p>}
      {post.hashtags.length > 0 && <p className="text-primary-ink">{post.hashtags.join(" ")}</p>}
      {post.briefCaption && <RevisedCaption caption={post.briefCaption} />}
    </div>
  );
}

/** A legenda mudou depois da pauta aprovada: mostra a versão aprovada para comparar. */
function RevisedCaption({ caption }: { caption: NonNullable<PlanningPostView["briefCaption"]> }) {
  return (
    <details className="group rounded-lg border text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <HistoryIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">Legenda revisada desde a pauta</span>
        <span className="shrink-0 font-normal whitespace-nowrap group-open:hidden">ver a aprovada</span>
      </summary>
      <div className="flex flex-col gap-2 border-t px-3 py-3 leading-relaxed text-muted-foreground">
        {caption.copy && <p className="whitespace-pre-wrap">{caption.copy}</p>}
        {caption.cta && <p className="whitespace-pre-line">{caption.cta}</p>}
        {caption.hashtags.length > 0 && <p>{caption.hashtags.join(" ")}</p>}
      </div>
    </details>
  );
}

/** A pauta (o texto da arte): headline, texto de apoio e os slides ou o roteiro. */
export function PostBrief({ post, className }: { post: PlanningPostView; className?: string }) {
  const parts = POST_KINDS[post.kind].parts;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <p className="text-lg leading-snug font-semibold whitespace-pre-line">{post.headline || "Sem headline"}</p>
        {post.supportText && <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{post.supportText}</p>}
      </div>
      {parts === "slides" && post.slides.length > 0 && (
        <PartList
          title={post.kind === "stories" ? "Telas" : "Slides"}
          items={post.slides.map((slide, index) => (
            <span key={index} className="flex min-w-0 flex-col gap-0.5">
              {slide.headline && <span className="font-medium whitespace-pre-line">{slide.headline}</span>}
              {slide.supportText && <span className="whitespace-pre-line text-muted-foreground">{slide.supportText}</span>}
            </span>
          ))}
        />
      )}
      {parts === "scenes" && post.scenes.length > 0 && (
        <PartList
          title="Roteiro"
          items={post.scenes.map((scene, index) => (
            <span key={index} className="whitespace-pre-line">
              {scene.text}
            </span>
          ))}
        />
      )}
    </div>
  );
}

function PartList({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <ol className="flex flex-col gap-3 text-sm leading-relaxed">
        {items.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold tabular-nums">
              {index + 1}
            </span>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}
