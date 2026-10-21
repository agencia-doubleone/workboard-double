import { ArrowLeftIcon, ChevronDownIcon, PencilIcon, TargetIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ClientLogo } from "@/components/client-logo";
import { RichTextContent } from "@/components/rich-text-editor";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { db } from "@/db";
import { formatCompactDay, formatMonth, isMonthKey, monthOf } from "@/lib/calendar";
import { todayInSaoPaulo } from "@/lib/jobs";
import { formatDate } from "@/lib/format";
import { artMediaKind, DEFAULT_PLANNING_STATUS, defaultPlanningMonth, SOCIAL_NETWORKS } from "@/lib/planning";
import { requireSession } from "@/lib/session";
import { getMediaUrl, isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { findPlanningBySlug, findPlanningMonth, listPlanningPosts } from "@/server/planning";
import { listPostArt } from "@/server/planning-approvals";
import { listPendingSendPosts, listPendingSends, listPostHistory } from "@/server/planning-sends";
import { MonthWorkspace } from "../month-workspace";
import { changesRequestOf, toPendingSendView, toPostHistories } from "../present";
import { MonthNav, NetworkIcon } from "../planning-ui";

export const metadata: Metadata = { title: "Planejamento" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// O planejamento de um cliente: informações gerais e, mês a mês (?mes=AAAA-MM),
// o status, o conceito e os posts.
export default function PlanejamentoPage({ params, searchParams }: PageProps<"/planejamentos/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanningContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PlanningContent({
  params,
  searchParams,
}: {
  params: PageProps<"/planejamentos/[slug]">["params"];
  searchParams: PageProps<"/planejamentos/[slug]">["searchParams"];
}) {
  const session = await requireSession();
  const found = await findPlanningBySlug(db, (await params).slug);
  if (!found) notFound();
  const { planning, client, members } = found;

  const today = todayInSaoPaulo();
  const current = monthOf(today);
  // Sem ?mes=, abre o mês que vem (o que a equipe está planejando).
  const standard = defaultPlanningMonth(today);
  const requested = first((await searchParams).mes);
  const month = isMonthKey(requested) ? requested : standard;
  const monthRow = await findPlanningMonth(db, planning.id, month);
  const posts = monthRow ? await listPlanningPosts(db, monthRow.id) : [];
  const postIds = posts.map((post) => post.id);
  const [art, waiting, sends, history] = await Promise.all([
    listPostArt(db, postIds),
    monthRow ? listPendingSendPosts(db, monthRow.id) : Promise.resolve([]),
    monthRow ? listPendingSends(db, monthRow.id) : Promise.resolve([]),
    listPostHistory(db, postIds),
  ]);
  const histories = toPostHistories(history);
  const base = `/planejamentos/${client.slug}`;
  const hrefFor = (target: string) => (target === standard ? base : `${base}?mes=${target}`);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={month === standard ? "/planejamentos" : `/planejamentos?mes=${month}`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ArrowLeftIcon className="size-4" />
        Planejamentos
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ClientLogo name={client.name} logoUrl={resolveMediaUrl(client.logoKey)} className="size-11 text-sm" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {planning.networks.length > 0 && (
                <span className="flex items-center gap-1.5">
                  {planning.networks.map((network) => (
                    <span key={network} className="flex items-center gap-1">
                      <NetworkIcon network={network} />
                      {SOCIAL_NETWORKS[network]}
                    </span>
                  ))}
                </span>
              )}
              {planning.postsPerMonth && (
                <span className="flex items-center gap-1">
                  <TargetIcon className="size-3.5" />
                  {planning.postsPerMonth} posts por mês
                </span>
              )}
              {members.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {members.slice(0, 4).map((person) => (
                      <UserAvatar
                        key={person.id}
                        name={person.name}
                        imageUrl={resolveMediaUrl(person.image)}
                        alt={person.name}
                        className="size-5 text-[8px] ring-2 ring-background"
                      />
                    ))}
                  </span>
                  {members.map((person) => person.name.split(" ")[0]).join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link href={`${base}/editar`} className={buttonVariants({ variant: "outline" })}>
          <PencilIcon data-icon="inline-start" />
          Editar planejamento
        </Link>
      </header>

      {planning.overview ? (
        <details className="group rounded-xl border bg-card shadow-raised">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Informações gerais
            <span className="text-xs font-normal text-muted-foreground">objetivo, tom de voz, público...</span>
            <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t px-4 py-4">
            <RichTextContent html={planning.overview} />
          </div>
        </details>
      ) : (
        <Link
          href={`${base}/editar`}
          className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Sem informações gerais. Adicione objetivo, tom de voz e público em “Editar planejamento”.
        </Link>
      )}

      <MonthNav month={month} current={current} hrefFor={hrefFor} />

      <MonthWorkspace
        // Outro mês = outro estado (conceito em edição, editor de post).
        key={month}
        planningId={planning.id}
        goal={planning.postsPerMonth}
        defaultNetwork={planning.networks[0] ?? null}
        approvesBrief={planning.approvesBrief}
        isAdmin={session.user.role === "admin"}
        uploadsEnabled={isMediaConfigured()}
        previewHref={`${base}/previa?mes=${month}`}
        pendingSends={sends.map(toPendingSendView)}
        month={{
          month,
          label: formatMonth(month),
          started: Boolean(monthRow),
          status: monthRow?.status ?? DEFAULT_PLANNING_STATUS,
          concept: monthRow?.concept ?? null,
          document: monthRow?.document ?? null,
        }}
        posts={posts.map((post) => ({
          id: post.id,
          date: post.date,
          dateLabel: post.date ? formatCompactDay(post.date) : null,
          network: post.network,
          kind: post.kind,
          headline: post.headline,
          supportText: post.supportText,
          copy: post.copy,
          cta: post.cta,
          hashtags: post.hashtags,
          slides: post.slides,
          scenes: post.scenes,
          notes: post.notes,
          status: post.status,
          briefState: post.briefState,
          briefDecision:
            post.briefDecidedAt && post.briefDecidedByName
              ? { byName: post.briefDecidedByName, side: post.briefDecidedBySide ?? "team", dateLabel: formatDate(post.briefDecidedAt) }
              : null,
          artState: post.artState,
          // Arte que saiu do CDN (versão antiga limpa) ou que não serve mais fica fora.
          art: (art.get(post.id) ?? []).flatMap((row) => {
            const kind = row.media ? artMediaKind(row.media.name) : null;
            return row.media && row.mediaId && kind
              ? [{ mediaId: row.mediaId, url: getMediaUrl(row.media.key), name: row.name, kind, role: row.role }]
              : [];
          }),
          waiting: waiting.find((row) => row.postId === post.id)?.stage ?? null,
          changesRequest: changesRequestOf(
            post,
            history.reviews.filter((review) => review.postId === post.id),
          ),
          history: (histories.get(post.id) ?? []).map(({ id, text, comment, dateLabel }) => ({ id, text, comment, dateLabel })),
        }))}
      />
    </div>
  );
}
