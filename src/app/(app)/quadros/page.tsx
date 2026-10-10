import { ChevronLeftIcon, ChevronRightIcon, PresentationIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listTeamMembers } from "@/server/jobs";
import { listLinkableJobs, listWhiteboards } from "@/server/whiteboards";
import { NewWhiteboardButton } from "./new-whiteboard-button";
import { parseWhiteboardsParams, WHITEBOARDS_PAGE_SIZE, whiteboardsHref } from "./params";
import { toCardView, toPersonView } from "./present";
import { WhiteboardCard } from "./whiteboard-card";
import { WhiteboardsToolbar } from "./whiteboards-toolbar";

export const metadata: Metadata = { title: "Quadros" };

export default function QuadrosPage({ searchParams }: PageProps<"/quadros">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WhiteboardsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function WhiteboardsContent({ searchParams }: { searchParams: PageProps<"/quadros">["searchParams"] }) {
  const { user } = await requireSession();
  const viewer = { id: user.id, isAdmin: user.role === "admin" };
  const params = parseWhiteboardsParams(await searchParams);

  const [{ items, total }, people, jobs] = await Promise.all([
    listWhiteboards(db, {
      viewer,
      search: params.busca,
      scope: params.escopo,
      limit: WHITEBOARDS_PAGE_SIZE,
      offset: (params.pagina - 1) * WHITEBOARDS_PAGE_SIZE,
    }),
    listTeamMembers(db),
    listLinkableJobs(db, viewer),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / WHITEBOARDS_PAGE_SIZE));
  const page = Math.min(params.pagina, pageCount);
  const filtered = Boolean(params.busca || params.escopo);
  const now = new Date();

  const newButton = (
    <NewWhiteboardButton
      people={people.filter((person) => person.id !== user.id).map(toPersonView)}
      jobs={jobs}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quadros"
        description="Quadros brancos para desenhar, colar imagens e espalhar post-its, sozinho ou com a equipe ao vivo."
        actions={newButton}
      />

      <div className="flex flex-col gap-4">
        <WhiteboardsToolbar params={params} />
        {items.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PresentationIcon />
              </EmptyMedia>
              <EmptyTitle>{filtered ? "Nenhum quadro encontrado" : "Nenhum quadro ainda"}</EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Tente outra busca ou mostre todos os quadros."
                  : "Crie um quadro pessoal para rascunhar ideias ou um coletivo para um brainstorm com a equipe."}
              </EmptyDescription>
            </EmptyHeader>
            {filtered && (
              <EmptyContent>
                <Link href="/quadros" className={buttonVariants({ variant: "outline" })}>
                  Mostrar todos
                </Link>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <WhiteboardCard board={toCardView(item, now)} />
              </li>
            ))}
          </ul>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {total} {total === 1 ? "quadro" : "quadros"}
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={whiteboardsHref({ ...params, pagina: page - 1 })} disabled={page <= 1} label="Página anterior">
                <ChevronLeftIcon />
              </PageLink>
              <span className="px-2 tabular-nums">
                {page} / {pageCount}
              </span>
              <PageLink
                href={whiteboardsHref({ ...params, pagina: page + 1 })}
                disabled={page >= pageCount}
                label="Próxima página"
              >
                <ChevronRightIcon />
              </PageLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline", size: "icon-sm" }));
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className} scroll={false}>
      {children}
    </Link>
  );
}
