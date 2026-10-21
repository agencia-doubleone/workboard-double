"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Hint } from "@/components/hint";
import { POST_KINDS, SOCIAL_NETWORKS, type PostKind, type PostScene, type PostSlide, type SocialNetwork } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { KIND_ICONS, NetworkIcon } from "./planning-icons";

// O texto de um post como a equipe vê no mês (o card do planejamento): a mesma
// peça no card da equipe e na pauta que o cliente aprova no portal.

type PostText = {
  dateLabel: string | null;
  network: SocialNetwork | null;
  kind: PostKind;
  headline: string;
  supportText: string | null;
  copy: string;
  cta: string | null;
  hashtags: string[];
  slides: PostSlide[];
  scenes: PostScene[];
};

/** Número, data, rede e formato (com quantos slides ou cenas), no começo do card. */
export function PostCardInfo({ post, index }: { post: PostText; index: number }) {
  const KindIcon = KIND_ICONS[post.kind];
  return (
    <>
      <span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">{index}</span>
      <span className={cn("text-sm font-medium tabular-nums", !post.dateLabel && "text-muted-foreground")}>
        {post.dateLabel ?? "Sem data"}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {post.network && (
          <Hint label={SOCIAL_NETWORKS[post.network]}>
            <span className="flex items-center">
              <NetworkIcon network={post.network} />
            </span>
          </Hint>
        )}
        <span className="flex items-center gap-1">
          <KindIcon className="size-3.5" />
          {POST_KINDS[post.kind].label}
          {post.slides.length > 0 && ` · ${post.slides.length} ${post.slides.length === 1 ? "slide" : "slides"}`}
          {post.scenes.length > 0 && ` · ${post.scenes.length} ${post.scenes.length === 1 ? "cena" : "cenas"}`}
        </span>
      </span>
    </>
  );
}

/**
 * Headline e texto de apoio, a legenda (copy, CTA e hashtags) e os slides ou o
 * roteiro. `onHeadlineClick`: a headline vira botão (a equipe abre o editor).
 */
export function PostTextContent({ post, onHeadlineClick }: { post: PostText; onHeadlineClick?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const longCopy = post.copy.split("\n").length > 6 || post.copy.length > 600;
  const headline = post.headline || <span className="text-muted-foreground">Sem headline</span>;
  const headlineClass = "text-left text-base leading-snug font-semibold whitespace-pre-line";

  return (
    <>
      {/* A pauta: headline e texto de apoio. */}
      <div className="flex flex-col gap-1">
        {onHeadlineClick ? (
          <button type="button" onClick={onHeadlineClick} className={cn(headlineClass, "outline-none hover:underline focus-visible:underline")}>
            {headline}
          </button>
        ) : (
          <p className={headlineClass}>{headline}</p>
        )}
        {post.supportText && <p className="text-sm leading-relaxed whitespace-pre-line">{post.supportText}</p>}
      </div>

      {/* A legenda: copy, CTA e hashtags (o "Copiar legenda" junta os três). */}
      {(post.copy || post.cta || post.hashtags.length > 0) && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {post.copy && (
            <div className="flex flex-col gap-1">
              <p className={cn("text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground", !expanded && longCopy && "line-clamp-6")}>
                {post.copy}
              </p>
              {longCopy && (
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  className="self-start text-xs font-medium text-primary-ink outline-none hover:underline focus-visible:underline"
                >
                  {expanded ? "Ver menos" : "Ver a legenda inteira"}
                </button>
              )}
            </div>
          )}
          {post.cta && (
            <p className="text-sm leading-relaxed whitespace-pre-line">
              <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">CTA</span>
              {post.cta}
            </p>
          )}
          {post.hashtags.length > 0 && <p className="text-xs leading-relaxed text-primary-ink">{post.hashtags.join(" ")}</p>}
        </div>
      )}

      {post.slides.length > 0 && (
        <PartsDetails
          title="Slides"
          items={post.slides.map((slide, position) => (
            <div key={position} className="flex min-w-0 flex-col gap-0.5">
              {slide.headline && <span className="font-medium whitespace-pre-line">{slide.headline}</span>}
              {slide.supportText && <span className="whitespace-pre-line text-muted-foreground">{slide.supportText}</span>}
            </div>
          ))}
        />
      )}
      {post.scenes.length > 0 && (
        <PartsDetails
          title="Roteiro"
          items={post.scenes.map((scene, position) => (
            <span key={position} className="whitespace-pre-line">
              {scene.text}
            </span>
          ))}
        />
      )}
    </>
  );
}

export const detailsSummaryClass =
  "flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden";

/** Slides do carrossel ou cenas do roteiro, numerados, num bloco que abre. */
function PartsDetails({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <details className="group rounded-lg border">
      <summary className={detailsSummaryClass}>
        {title}
        <span className="font-normal tabular-nums">{items.length}</span>
        <ChevronDownIcon className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <ol className="flex flex-col gap-3 border-t px-3 py-3 text-sm leading-relaxed">
        {items.map((item, position) => (
          <li key={position} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold tabular-nums">
              {position + 1}
            </span>
            {item}
          </li>
        ))}
      </ol>
    </details>
  );
}
