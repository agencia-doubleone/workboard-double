import { ArrowLeftIcon, EyeIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ClientPlanningMonth } from "@/components/planning/client-month";
import { toPlanningPastPostView, toPlanningPostView, toPlanningProfile } from "@/components/planning/present";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { formatMonth, isMonthKey } from "@/lib/calendar";
import { todayInSaoPaulo } from "@/lib/jobs";
import { defaultPlanningMonth } from "@/lib/planning";
import { requireSession } from "@/lib/session";
import { findPlanningBySlug, findPlanningMonth, listPlanningPosts } from "@/server/planning";
import { listPastFeedPosts, listPostArt } from "@/server/planning-approvals";

export const metadata: Metadata = { title: "Prévia do planejamento" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
/** Posts dos meses anteriores no feed simulado. */
const PAST_FEED_LIMIT = 30;

// A prévia do mês como o cliente vai ver no portal (apresentação, feed e lista),
// para a equipe conferir antes de enviar. Mostra todos os posts do mês; no
// portal, o cliente vê só os que foram enviados a ele.
export default function PreviaPlanejamentoPage({ params, searchParams }: PageProps<"/planejamentos/[slug]/previa">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PreviewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PreviewContent({
  params,
  searchParams,
}: {
  params: PageProps<"/planejamentos/[slug]/previa">["params"];
  searchParams: PageProps<"/planejamentos/[slug]/previa">["searchParams"];
}) {
  await requireSession();
  const found = await findPlanningBySlug(db, (await params).slug);
  if (!found) notFound();

  const requested = first((await searchParams).mes);
  const month = isMonthKey(requested) ? requested : defaultPlanningMonth(todayInSaoPaulo());
  const monthRow = await findPlanningMonth(db, found.planning.id, month);
  const [posts, past] = await Promise.all([
    monthRow ? listPlanningPosts(db, monthRow.id) : Promise.resolve([]),
    listPastFeedPosts(db, { planningId: found.planning.id, month, limit: PAST_FEED_LIMIT }),
  ]);
  const art = await listPostArt(db, [...posts.map((post) => post.id), ...past.map((row) => row.post.id)]);
  const back = `/planejamentos/${found.client.slug}?mes=${month}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={back}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ArrowLeftIcon className="size-4" />
        {found.client.name} · {formatMonth(month)}
      </Link>
      <div className="flex items-start gap-3 rounded-xl border border-dashed px-4 py-3">
        <EyeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Prévia do portal do cliente.</span> Mostra todos os posts do mês, na
          etapa em que estão: a pauta em cards e, quando a arte já subiu, a apresentação, o feed e a lista. No portal, o cliente vai ver só o que for enviado a ele.
        </p>
      </div>
      <ClientPlanningMonth
        monthLabel={formatMonth(month)}
        concept={monthRow?.concept ?? null}
        posts={posts.map((post) => toPlanningPostView(post, art.get(post.id) ?? []))}
        pastPosts={past.map((row) => toPlanningPastPostView(row.post, row.month, art.get(row.post.id) ?? []))}
        profile={toPlanningProfile(found.client)}
      />
    </div>
  );
}
