"use client";

import { ChevronLeftIcon, ChevronRightIcon, ClapperboardIcon, Grid3X3Icon, LayersIcon } from "lucide-react";
import { useState } from "react";

import { ClientLogo } from "@/components/client-logo";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PostBrief, PostMeta } from "./post-parts";
import type { PlanningArtView, PlanningPastPostView, PlanningPostView, PlanningProfileView } from "./types";

// O feed do Instagram simulado: o perfil do cliente e a grade de 3 colunas, com
// o mês do mais novo para o mais antigo e, abaixo, os posts aprovados dos meses
// anteriores (mais apagados), para ver como o mês novo fica junto do que já foi
// publicado. Só entram posts do Instagram (Stories ficam fora do feed). A grade
// usa o recorte vertical (3:4) do perfil do Instagram. Clicar abre o post como
// no Instagram; `renderActions` põe as respostas do cliente (portal).

/** Do mais novo para o mais antigo (no mesmo dia, o que vem depois na lista primeiro); sem data no fim. */
function newestFirst<T extends PlanningPostView>(posts: T[]) {
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => {
      if (a.post.date && b.post.date) return b.post.date.localeCompare(a.post.date) || b.index - a.index;
      if (a.post.date || b.post.date) return a.post.date ? -1 : 1;
      return b.index - a.index;
    })
    .map(({ post }) => post);
}

export function isFeedPost(post: PlanningPostView) {
  return post.network === "instagram" && post.kind !== "stories";
}

export function InstagramFeed({
  profile,
  posts,
  pastPosts,
  renderActions,
}: {
  profile: PlanningProfileView;
  posts: PlanningPostView[];
  pastPosts: PlanningPastPostView[];
  renderActions?: (post: PlanningPostView) => React.ReactNode;
}) {
  const current = newestFirst(posts.filter(isFeedPost));
  const [open, setOpen] = useState<{ post: PlanningPostView; past: boolean } | null>(null);
  const [shown, setShown] = useState(open);
  if (open && open !== shown) setShown(open);
  // Sem o Instagram cadastrado no cliente, o nome dele no lugar do @.
  const handle = profile.instagramHandle ?? profile.name;

  return (
    <div className="mx-auto flex w-full max-w-[38rem] flex-col rounded-xl border bg-card shadow-raised">
      <header className="flex items-center gap-5 px-5 py-6 sm:gap-8 sm:px-8">
        <ClientLogo name={profile.name} logoUrl={profile.logoUrl} className="size-20 rounded-full border bg-background p-2 text-lg sm:size-24" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="truncate text-lg font-semibold">{handle}</p>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{current.length + pastPosts.length}</span> publicações
          </p>
          {profile.instagramHandle && <p className="truncate text-sm font-medium">{profile.name}</p>}
        </div>
      </header>
      <div className="flex justify-center border-t">
        <span className="-mt-px flex items-center gap-1.5 border-t border-foreground py-3 text-xs font-semibold tracking-wider uppercase">
          <Grid3X3Icon className="size-3.5" />
          Publicações
        </span>
      </div>

      {current.length === 0 && pastPosts.length === 0 ? (
        <p className="px-6 pb-10 pt-6 text-center text-sm text-muted-foreground">Nenhum post do Instagram neste mês.</p>
      ) : (
        <>
          <FeedGrid posts={current} onOpen={(post) => setOpen({ post, past: false })} />
          {pastPosts.length > 0 && (
            <>
              <p className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">Já aprovados nos meses anteriores</p>
              <FeedGrid posts={pastPosts} past onOpen={(post) => setOpen({ post, past: true })} />
            </>
          )}
        </>
      )}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
          {shown && (
            <FeedPostView
              key={shown.post.id}
              post={shown.post}
              profile={profile}
              handle={handle}
              actions={shown.past ? null : renderActions?.(shown.post)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeedGrid<T extends PlanningPostView>({ posts, past = false, onOpen }: { posts: T[]; past?: boolean; onOpen: (post: T) => void }) {
  return (
    <ul className={cn("grid grid-cols-3 gap-0.5", past && "opacity-55")}>
      {posts.map((post) => (
        <li key={post.id}>
          <FeedTile post={post} onOpen={() => onOpen(post)} />
        </li>
      ))}
    </ul>
  );
}

/** A miniatura da grade: a primeira arte (ou a capa do vídeo); sem arte, um quadro com a headline. */
function FeedTile({ post, onOpen }: { post: PlanningPostView; onOpen: () => void }) {
  const art = post.art.filter((item) => item.role === "art");
  const cover = post.art.find((item) => item.role === "cover");
  const first = art[0];
  const isVideo = post.kind === "reels" || post.kind === "video";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Abrir o post ${post.headline || post.dateLabel || ""}`.trim()}
      className="group/tile relative block aspect-[3/4] w-full overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.url} alt="" className="size-full object-cover" />
      ) : first?.kind === "video" ? (
        <video src={first.url} muted playsInline preload="metadata" className="size-full object-cover" />
      ) : first ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
          <span className="line-clamp-5 text-xs leading-snug font-medium wrap-anywhere">{post.headline || "Sem headline"}</span>
          <span className="text-[10px] text-muted-foreground">Sem arte ainda</span>
        </span>
      )}
      {(art.length > 1 || isVideo) && (
        <span className="absolute top-2 right-2 text-white drop-shadow">
          {isVideo ? <ClapperboardIcon className="size-4" /> : <LayersIcon className="size-4" />}
        </span>
      )}
      <span className="absolute inset-0 bg-black/0 transition-colors group-hover/tile:bg-black/10" />
    </button>
  );
}

/** O post aberto, como no Instagram: a arte (com as setas do carrossel) e, ao lado, o perfil, a legenda e as respostas. */
function FeedPostView({
  post,
  profile,
  handle,
  actions,
}: {
  post: PlanningPostView;
  profile: PlanningProfileView;
  handle: string;
  actions: React.ReactNode;
}) {
  const art = post.art.filter((item) => item.role === "art");
  const cover = post.art.find((item) => item.role === "cover") ?? null;
  const [index, setIndex] = useState(0);
  const item: PlanningArtView | undefined = art[index];
  const many = art.length > 1;

  return (
    <div className="grid max-h-[calc(100svh-2rem)] overflow-y-auto wrap-anywhere md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:overflow-hidden">
      <div className="relative flex min-h-64 items-center justify-center bg-black">
        {post.stage === "pauta" || !item ? (
          <div className="w-full bg-muted p-6">
            <PostBrief post={post} />
          </div>
        ) : item.kind === "video" ? (
          <video
            key={item.id}
            src={item.url}
            poster={cover?.url}
            controls
            playsInline
            preload="metadata"
            className="max-h-[80svh] w-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.url} alt="" className="max-h-[80svh] w-full object-contain" />
        )}
        {many && (
          <>
            <CarouselButton side="left" disabled={index === 0} onClick={() => setIndex(index - 1)} />
            <CarouselButton side="right" disabled={index === art.length - 1} onClick={() => setIndex(index + 1)} />
            <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
              {art.map((slide, position) => (
                <span key={slide.id} className={cn("size-1.5 rounded-full bg-white/50", position === index && "bg-white")} />
              ))}
            </span>
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-col md:max-h-[80svh]">
        <div className="flex items-center gap-3 border-b px-4 py-3 pr-12">
          <ClientLogo name={profile.name} logoUrl={profile.logoUrl} className="size-8 rounded-full border bg-background p-0.5 text-[10px]" />
          <DialogTitle className="truncate text-sm font-semibold">{handle}</DialogTitle>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
          <DialogDescription render={<div />} className="flex flex-col gap-3 text-foreground">
            {post.copy && (
              <p className="whitespace-pre-wrap">
                <span className="mr-1.5 font-semibold">{handle}</span>
                {post.copy}
              </p>
            )}
            {post.cta && <p className="whitespace-pre-line">{post.cta}</p>}
            {post.hashtags.length > 0 && <p className="text-primary-ink">{post.hashtags.join(" ")}</p>}
            {!post.copy && !post.cta && post.hashtags.length === 0 && <span className="text-muted-foreground">Sem legenda.</span>}
          </DialogDescription>
          <PostMeta post={post} className="mt-auto pt-2" />
        </div>
        {actions && <div className="border-t px-4 py-3">{actions}</div>}
      </div>
    </div>
  );
}

function CarouselButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Imagem anterior" : "Próxima imagem"}
      className={cn(
        "absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow-control outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
