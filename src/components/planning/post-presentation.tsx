"use client";

import { PlayIcon } from "lucide-react";
import { useState } from "react";

import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";
import { cn } from "@/lib/utils";
import { PostBrief, PostCaption, PostMeta } from "./post-parts";
import type { PlanningArtView, PlanningPostView } from "./types";

// A apresentação do mês (o PDF que a agência montava, agora na plataforma): um
// post por bloco, na ordem das datas, com a arte de um lado e a copy com as
// hashtags do outro. Carrossel com todos os slides em grade; Stories só com a
// arte; Reels e vídeo tocam ali mesmo. Na etapa de pauta, no lugar da arte vai
// o texto dela. `renderActions` põe as respostas do cliente em cada post (portal).

export function PlanningPresentation({
  monthLabel,
  concept,
  posts,
  renderActions,
}: {
  monthLabel: string;
  concept: string | null;
  posts: PlanningPostView[];
  renderActions?: (post: PlanningPostView) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 rounded-xl border bg-card px-6 py-8 text-center shadow-raised">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">Planejamento redes sociais</p>
        <h2 className="text-2xl font-semibold tracking-tight">{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</h2>
        {concept && <p className="mx-auto max-w-2xl text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{concept}</p>}
      </header>
      {posts.map((post) => (
        <PresentationBlock key={post.id} post={post} actions={renderActions?.(post)} />
      ))}
    </div>
  );
}

function PresentationBlock({ post, actions }: { post: PlanningPostView; actions: React.ReactNode }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const items: LightboxItem[] = post.art.map((item) => ({
    id: item.id,
    url: item.url,
    name: item.role === "cover" ? `Capa · ${item.name}` : item.name,
    kind: item.kind,
  }));
  const art = post.art.filter((item) => item.role === "art");
  const cover = post.art.find((item) => item.role === "cover") ?? null;
  const open = (item: PlanningArtView) => setLightbox(post.art.indexOf(item));
  // Stories não têm legenda: só a arte, centralizada (como no PDF).
  const artOnly = post.stage === "arte" && post.kind === "stories";

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-raised wrap-anywhere sm:p-6">
      <div className={cn("grid gap-6", !artOnly && "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start")}>
        <div className="flex min-w-0 justify-center">
          {post.stage === "pauta" ? (
            <div className="flex w-full flex-col gap-3 rounded-lg bg-muted/50 p-5">
              <span className="text-xs font-medium text-muted-foreground">Pauta: o texto da arte</span>
              <PostBrief post={post} />
            </div>
          ) : post.kind === "carrossel" ? (
            <ul className="flex w-full flex-wrap justify-center gap-2">
              {art.map((item, index) => (
                <li key={item.id} className="w-[calc((100%-1rem)/3)]">
                  <ArtButton item={item} index={index + 1} onOpen={() => open(item)} />
                </li>
              ))}
            </ul>
          ) : post.kind === "stories" ? (
            <ul className="flex flex-wrap justify-center gap-3">
              {art.map((item) => (
                <li key={item.id} className="w-40 sm:w-52">
                  <ArtButton item={item} aspect="aspect-[9/16]" onOpen={() => open(item)} />
                </li>
              ))}
            </ul>
          ) : art[0]?.kind === "video" ? (
            <video
              src={art[0].url}
              poster={cover?.url}
              controls
              playsInline
              preload="metadata"
              className={cn("max-h-[36rem] w-auto max-w-full rounded-lg bg-black", post.kind === "reels" && "aspect-[9/16]")}
            />
          ) : art[0] ? (
            <button
              type="button"
              onClick={() => open(art[0])}
              aria-label={`Ver ${art[0].name} em tamanho grande`}
              className="overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art[0].url} alt="" className="max-h-[36rem] w-auto max-w-full" />
            </button>
          ) : null}
        </div>

        {!artOnly && (
          <div className="flex min-w-0 flex-col gap-3">
            <span className="text-xs font-semibold">Copy</span>
            <PostCaption post={post} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <PostMeta post={post} />
        {actions}
      </div>
      <MediaLightbox items={items} index={lightbox} onIndexChange={setLightbox} />
    </article>
  );
}

/** Uma arte clicável (abre no lightbox), com o número do slide e o play nos vídeos. */
function ArtButton({
  item,
  index,
  aspect = "aspect-[4/5]",
  onOpen,
}: {
  item: PlanningArtView;
  index?: number;
  aspect?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ver ${item.name} em tamanho grande`}
      className={cn("relative block w-full overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50", aspect)}
    >
      {item.kind === "video" ? (
        <>
          <video src={item.url} muted playsInline preload="metadata" className="size-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
              <PlayIcon className="size-4 fill-current" />
            </span>
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt="" className="size-full object-cover" />
      )}
      {index !== undefined && (
        <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded bg-black/55 text-[11px] font-semibold text-white tabular-nums">
          {index}
        </span>
      )}
    </button>
  );
}
