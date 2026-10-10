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
import { DEFAULT_PLANNING_STATUS, formatKind, SOCIAL_NETWORKS } from "@/lib/planning";
import { requireSession } from "@/lib/session";
import { resolveMediaUrl } from "@/server/media";
import { findPlanningBySlug, findPlanningMonth, listPlanningPosts } from "@/server/planning";
import { MonthWorkspace } from "../month-workspace";
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
  await requireSession();
  const found = await findPlanningBySlug(db, (await params).slug);
  if (!found) notFound();
  const { planning, client, members } = found;

  const current = monthOf(todayInSaoPaulo());
  const requested = first((await searchParams).mes);
  const month = isMonthKey(requested) ? requested : current;
  const monthRow = await findPlanningMonth(db, planning.id, month);
  const posts = monthRow ? await listPlanningPosts(db, monthRow.id) : [];
  const base = `/planejamentos/${client.slug}`;
  const hrefFor = (target: string) => (target === current ? base : `${base}?mes=${target}`);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={month === current ? "/planejamentos" : `/planejamentos?mes=${month}`}
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
          format: post.format,
          formatKind: formatKind(post.format),
          topic: post.topic,
          headline: post.headline,
          copy: post.copy,
          sections: post.sections,
          status: post.status,
        }))}
      />
    </div>
  );
}
