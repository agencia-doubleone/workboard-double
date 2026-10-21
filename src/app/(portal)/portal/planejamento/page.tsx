import { CalendarRangeIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { toPlanningPastPostView, toPlanningPostView, toPlanningProfile, toPortalPostState } from "@/components/planning/present";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { formatMonth } from "@/lib/calendar";
import { PORTAL_PLANNING_PATH } from "@/lib/portal";
import { requirePortalSession } from "@/lib/portal-session";
import { listPastFeedPosts, listPostArt } from "@/server/planning-approvals";
import { findClientPlanning, listSharedMonths, loadClientMonth } from "@/server/planning-sends";
import { PortalPlanningView } from "./portal-planning-view";

export const metadata: Metadata = { title: "Planejamento" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
/** Posts dos meses anteriores no feed simulado. */
const PAST_FEED_LIMIT = 30;

// O planejamento de redes sociais no portal (?mes=AAAA-MM). O planejamento sai
// do cliente da sessão, nunca da URL; só aparecem os meses e os posts que a
// equipe já enviou. Sem ?mes=, abre o mês com algo esperando resposta (ou o
// mais recente enviado).
export default function PortalPlanningPage({ searchParams }: PageProps<"/portal/planejamento">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanningContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PlanningContent({ searchParams }: { searchParams: PageProps<"/portal/planejamento">["searchParams"] }) {
  const { contact, client } = await requirePortalSession();
  const found = await findClientPlanning(db, client.id);
  const months = found ? await listSharedMonths(db, found.planning.id) : [];
  if (!found || months.length === 0) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarRangeIcon />
          </EmptyMedia>
          <EmptyTitle>Nenhum planejamento por aqui ainda</EmptyTitle>
          <EmptyDescription>
            Quando a Double One mandar a pauta ou as artes de um mês para a {client.name} aprovar, elas aparecem aqui, como
            apresentação e como no feed do Instagram.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const requested = first((await searchParams).mes);
  const current =
    months.find((row) => row.month === requested) ??
    // Sem ?mes=: o mês mais antigo com algo esperando resposta; sem isso, o mais recente.
    [...months].reverse().find((row) => row.waiting.pauta + row.waiting.arte > 0) ??
    months[0];
  const index = months.indexOf(current);
  const hrefFor = (row: (typeof months)[number] | undefined) => (row ? `${PORTAL_PLANNING_PATH}?mes=${row.month}` : null);

  const [rows, past] = await Promise.all([
    loadClientMonth(db, current.id),
    listPastFeedPosts(db, { planningId: found.planning.id, month: current.month, limit: PAST_FEED_LIMIT }),
  ]);
  const pastArt = await listPostArt(db, past.map((row) => row.post.id));

  return (
    <PortalPlanningView
      key={current.month}
      month={current.month}
      monthLabel={formatMonth(current.month)}
      concept={current.concept}
      posts={rows.map((row) => toPlanningPostView(row.post, row.art, row.stage))}
      states={Object.fromEntries(rows.map((row) => [row.post.id, toPortalPostState(row)]))}
      pastPosts={past.map((row) => toPlanningPastPostView(row.post, row.month, pastArt.get(row.post.id) ?? []))}
      profile={toPlanningProfile(found.client)}
      canApprove={contact.canApprove}
      // Os meses vêm do mais novo para o mais antigo.
      previousHref={hrefFor(months[index + 1])}
      nextHref={hrefFor(months[index - 1])}
    />
  );
}
