"use client";

import { Tabs } from "@base-ui/react/tabs";
import { GalleryHorizontalEndIcon, Grid3X3Icon, ImagesIcon, ListIcon, NotebookPenIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { InstagramFeed } from "./instagram-feed";
import { PlanningPostList } from "./planning-views";
import { PlanningPresentation } from "./post-presentation";
import { PostCardInfo, PostTextContent } from "./post-text";
import type { PlanningPastPostView, PlanningPostView, PlanningProfileView } from "./types";

// O mês do planejamento como o cliente vê (portal e prévia da equipe), em abas:
// a Pauta, como a equipe vê o mês (um card por post, com o texto), e as artes
// na Apresentação (o PDF de hoje) e no Feed simulado; a Lista tem todos os
// posts com a situação. A pauta aparece para todos os posts que foram ao
// cliente; a resposta da pauta, só nos que esperam a pauta.

type View = "pauta" | "apresentacao" | "feed" | "lista";

const TAB_CLASS =
  "flex h-8 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-control dark:aria-selected:bg-input/50";

export function ClientPlanningMonth({
  monthLabel,
  concept,
  posts,
  pastPosts,
  profile,
  initialStage,
  renderActions,
  renderStatus,
}: {
  monthLabel: string;
  concept: string | null;
  posts: PlanningPostView[];
  pastPosts: PlanningPastPostView[];
  profile: PlanningProfileView;
  /** A etapa que abre primeiro (ex.: a que tem algo esperando resposta). */
  initialStage?: PlanningPostView["stage"];
  renderActions?: (post: PlanningPostView) => React.ReactNode;
  renderStatus?: (post: PlanningPostView) => React.ReactNode;
}) {
  const arts = posts.filter((post) => post.stage === "arte");
  const [view, setView] = useState<View>(
    initialStage === "pauta" ? "pauta" : initialStage === "arte" || arts.length > 0 ? "apresentacao" : "pauta",
  );

  return (
    <Tabs.Root value={view} onValueChange={(value) => setView(value as View)} className="flex flex-col gap-4">
      <Tabs.List aria-label="Como ver o planejamento" className="flex w-fit flex-wrap gap-1 rounded-md border bg-muted/40 p-0.5">
        <Tabs.Tab value="pauta" className={TAB_CLASS}>
          <NotebookPenIcon className="size-4" />
          Pauta
        </Tabs.Tab>
        <Tabs.Tab value="apresentacao" className={TAB_CLASS}>
          <GalleryHorizontalEndIcon className="size-4" />
          Apresentação
        </Tabs.Tab>
        <Tabs.Tab value="feed" className={TAB_CLASS}>
          <Grid3X3Icon className="size-4" />
          Feed
        </Tabs.Tab>
        <Tabs.Tab value="lista" className={TAB_CLASS}>
          <ListIcon className="size-4" />
          Lista
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="pauta" className="flex flex-col gap-4 outline-none">
        {concept && (
          <section className="flex flex-col gap-2 rounded-xl border bg-primary-soft/40 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <SparklesIcon className="size-4 text-primary-ink" />
              Conceito do mês
            </h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{concept}</p>
          </section>
        )}
        <ol className="flex flex-col gap-3">
          {posts.map((post, index) => (
            <li key={post.id}>
              <BriefCard post={post} index={index + 1} actions={post.stage === "pauta" ? renderActions?.(post) : null} />
            </li>
          ))}
        </ol>
      </Tabs.Panel>
      <Tabs.Panel value="apresentacao" className="outline-none">
        {arts.length > 0 ? (
          <PlanningPresentation monthLabel={monthLabel} concept={concept} posts={arts} renderActions={renderActions} />
        ) : (
          <NoArt />
        )}
      </Tabs.Panel>
      <Tabs.Panel value="feed" className="outline-none">
        <InstagramFeed profile={profile} posts={arts} pastPosts={pastPosts} renderActions={renderActions} />
      </Tabs.Panel>
      <Tabs.Panel value="lista" className="outline-none">
        <PlanningPostList posts={posts} renderStatus={renderStatus} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function NoArt() {
  return (
    <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      <ImagesIcon className="size-5" />
      As artes deste mês ainda não chegaram. Por enquanto, veja a pauta.
    </p>
  );
}

/** Um post da pauta, como no card do mês da equipe: o texto e, embaixo, a resposta (quando espera a pauta). */
function BriefCard({ post, index, actions }: { post: PlanningPostView; index: number; actions: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-raised wrap-anywhere">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PostCardInfo post={post} index={index} />
        {post.stage === "arte" && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImagesIcon className="size-3.5" />
            Já com a arte (na Apresentação)
          </span>
        )}
      </header>
      <PostTextContent post={post} />
      {actions && <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">{actions}</div>}
    </article>
  );
}
