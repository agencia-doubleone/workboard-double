import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { todayInSaoPaulo } from "@/lib/jobs";
import { formatMonthSpan, formatPeriod, monthsInPeriod, REPORT_TABS, type ReportTab } from "@/lib/reports";
import { requireAdmin } from "@/lib/session";
import { loadPlanningReport } from "@/server/planning-reports";
import {
  byPerson,
  countMessagesByAuthor,
  isConcludedIn,
  listReportPeople,
  loadReportJobs,
  periodBounds,
  stageDurations,
  stalledJobs,
} from "@/server/reports";
import { ClientsReport } from "./clients-report";
import { DeadlinesReport } from "./deadlines-report";
import { GeneralReport } from "./general-report";
import { parseReportParams, reportHref, type ReportParams } from "./params";
import { PlanningReport } from "./planning-report";
import { ReportToolbar } from "./report-toolbar";
import { StagesReport } from "./stages-report";
import { TeamReport } from "./team-report";

export const metadata: Metadata = { title: "Relatórios" };

// Relatórios (só admins): visão geral, por cliente, por funcionário, prazos,
// etapas e planejamentos, num período escolhido. Definições das contas em src/lib/reports.ts.
export default function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportsContent({ searchParams }: { searchParams: PageProps<"/relatorios">["searchParams"] }) {
  await requireAdmin();
  const today = todayInSaoPaulo();
  const params = parseReportParams(await searchParams, today);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Entregas, prazos, clientes, equipe e planejamentos no período escolhido. Exporte cada tabela em CSV ou imprima a página."
      />
      <div className="flex flex-col gap-4">
        <ReportTabs params={params} />
        <ReportToolbar key={`${params.period.from}:${params.period.to}`} params={params} />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{REPORT_TABS[params.tab]}</span> · período de{" "}
          <span className="tabular-nums">{formatPeriod(params.period)}</span>
          {(params.tab === "prazos" || params.tab === "etapas") && " (atrasados, próximos e parados são de hoje)"}
          {params.tab === "planejamentos" && ` (por mês: ${formatMonthSpan(monthsInPeriod(params.period))})`}
        </p>
      </div>
      <TabContent params={params} today={today} />
    </div>
  );
}

async function TabContent({ params, today }: { params: ReportParams; today: string }) {
  if (params.tab === "planejamentos") {
    const months = monthsInPeriod(params.period);
    return <PlanningReport entries={await loadPlanningReport(db, months)} months={months} today={today} />;
  }

  const jobs = await loadReportJobs(db);
  const bounds = periodBounds(params.period);
  switch (params.tab) {
    case "geral":
      return <GeneralReport jobs={jobs} params={params} today={today} />;
    case "clientes":
      return <ClientsReport jobs={jobs} params={params} today={today} />;
    case "equipe": {
      const [people, messages] = await Promise.all([listReportPeople(db, jobs), countMessagesByAuthor(db, bounds)]);
      return <TeamReport rows={byPerson(jobs, people, bounds, today, messages)} params={params} />;
    }
    case "prazos":
      return <DeadlinesReport jobs={jobs} params={params} today={today} />;
    case "etapas": {
      const concluded = jobs.filter((item) => isConcludedIn(item, bounds));
      const stages = await stageDurations(db, concluded);
      return (
        <StagesReport
          stages={stages}
          concludedCount={concluded.length}
          stalled={stalledJobs(jobs, new Date())}
          params={params}
          today={today}
        />
      );
    }
  }
}

const tabClass =
  "flex h-8 items-center rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-control dark:aria-[current=page]:bg-input/50";

function ReportTabs({ params }: { params: ReportParams }) {
  return (
    <nav
      aria-label="Relatórios"
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-md border bg-muted/40 p-0.5 print:hidden"
    >
      {(Object.entries(REPORT_TABS) as [ReportTab, string][]).map(([tab, label]) => (
        <Link
          key={tab}
          href={reportHref({ ...params, tab, clientId: undefined })}
          aria-current={params.tab === tab ? "page" : undefined}
          scroll={false}
          className={tabClass}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
