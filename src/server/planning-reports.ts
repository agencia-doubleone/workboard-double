import { count, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db";
import { client, planning, planningMonth, planningPost } from "@/db/schema";
import { dayKey } from "@/lib/format";
import { isApprovedStatus, PLANNING_STATUS_KEYS, type PlanningStatus } from "@/lib/planning";
import { listPlanningMembers, type PlanningPerson } from "@/server/planning";

// Relatório dos planejamentos (admins), mês a mês. Os dados são lidos de uma vez
// (loadPlanningReport) e as contas são funções puras sobre eles; as definições
// estão em src/lib/reports.ts. Sem "server-only": roda nos scripts contra PGlite.

/** Um mês de um cliente (o planejamento daquele mês). */
export type PlanningReportEntry = {
  planningId: string;
  client: { id: string; name: string; slug: string; logoKey: string | null };
  /** "AAAA-MM" */
  month: string;
  /** null = o mês ainda não foi começado. */
  status: PlanningStatus | null;
  /** Meta de posts por mês (a de hoje). */
  goal: number | null;
  /** Posts do mês em cada status. */
  posts: Record<PlanningStatus, number>;
  members: PlanningPerson[];
};

const emptyCounts = () => Object.fromEntries(PLANNING_STATUS_KEYS.map((status) => [status, 0])) as Record<PlanningStatus, number>;

export const postTotal = (entry: PlanningReportEntry) => PLANNING_STATUS_KEYS.reduce((total, status) => total + entry.posts[status], 0);
export const postsApproved = (entry: PlanningReportEntry) => entry.posts.aprovado + entry.posts.finalizado;
export const isMonthApproved = (entry: PlanningReportEntry) => entry.status !== null && isApprovedStatus(entry.status);
/** O mês já começou e o planejamento dele não está aprovado nem finalizado. */
export const isMonthLate = (entry: PlanningReportEntry, currentMonth: string) => entry.month <= currentMonth && !isMonthApproved(entry);

/** Os meses de cada cliente com planejamento dentro de `months` (ver as regras em src/lib/reports.ts). */
export async function loadPlanningReport(database: Database, months: string[]): Promise<PlanningReportEntry[]> {
  if (months.length === 0) return [];
  const [plannings, monthRows, postCounts] = await Promise.all([
    database
      .select({
        id: planning.id,
        goal: planning.postsPerMonth,
        createdAt: planning.createdAt,
        client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey, archivedAt: client.archivedAt },
      })
      .from(planning)
      .innerJoin(client, eq(client.id, planning.clientId)),
    database
      .select({ id: planningMonth.id, planningId: planningMonth.planningId, month: planningMonth.month, status: planningMonth.status })
      .from(planningMonth)
      .where(inArray(planningMonth.month, months)),
    database
      .select({ monthId: planningPost.monthId, status: planningPost.status, total: count() })
      .from(planningPost)
      .innerJoin(planningMonth, eq(planningMonth.id, planningPost.monthId))
      .where(inArray(planningMonth.month, months))
      .groupBy(planningPost.monthId, planningPost.status),
  ]);
  const members = await listPlanningMembers(database, plannings.map((row) => row.id));

  const rowsByKey = new Map(monthRows.map((row) => [`${row.planningId}:${row.month}`, row]));
  const countsByMonth = new Map<string, Record<PlanningStatus, number>>();
  for (const row of postCounts) {
    const counts = countsByMonth.get(row.monthId) ?? emptyCounts();
    counts[row.status] += row.total;
    countsByMonth.set(row.monthId, counts);
  }

  const entries: PlanningReportEntry[] = [];
  for (const item of plannings) {
    const startMonth = dayKey(item.createdAt).slice(0, 7);
    const { archivedAt, ...clientInfo } = item.client;
    for (const month of months) {
      const row = rowsByKey.get(`${item.id}:${month}`);
      if (!row && (archivedAt || month < startMonth)) continue;
      entries.push({
        planningId: item.id,
        client: clientInfo,
        month,
        status: row?.status ?? null,
        goal: item.goal,
        posts: (row && countsByMonth.get(row.id)) ?? emptyCounts(),
        members: members.get(item.id) ?? [],
      });
    }
  }
  return entries.sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR") || a.month.localeCompare(b.month));
}

export type PlanningSummary = {
  /** Clientes (planejamentos) com algum mês contado. */
  clients: number;
  /** Meses contados (cliente × mês). */
  months: number;
  notStarted: number;
  /** Meses aprovados ou finalizados. */
  approvedMonths: number;
  finalized: number;
  late: number;
  posts: number;
  approved: number;
  adjustments: number;
  /** Soma das metas dos meses que têm meta. */
  goal: number;
  goalMonths: number;
  /** Meses com meta em que o número de posts chegou à meta. */
  goalReached: number;
};

export function summarizePlannings(entries: PlanningReportEntry[], currentMonth: string): PlanningSummary {
  const withGoal = entries.filter((entry) => entry.goal !== null);
  return {
    clients: new Set(entries.map((entry) => entry.planningId)).size,
    months: entries.length,
    notStarted: entries.filter((entry) => entry.status === null).length,
    approvedMonths: entries.filter(isMonthApproved).length,
    finalized: entries.filter((entry) => entry.status === "finalizado").length,
    late: entries.filter((entry) => isMonthLate(entry, currentMonth)).length,
    posts: entries.reduce((total, entry) => total + postTotal(entry), 0),
    approved: entries.reduce((total, entry) => total + postsApproved(entry), 0),
    adjustments: entries.reduce((total, entry) => total + entry.posts.ajustes, 0),
    goal: withGoal.reduce((total, entry) => total + entry.goal!, 0),
    goalMonths: withGoal.length,
    goalReached: withGoal.filter((entry) => postTotal(entry) >= entry.goal!).length,
  };
}

export type PlanningClientRow = PlanningSummary & {
  planningId: string;
  client: PlanningReportEntry["client"];
  members: PlanningPerson[];
  /** Os meses do cliente, em ordem (o status de cada um). */
  entries: PlanningReportEntry[];
};

/** Um resumo por cliente, em ordem alfabética. */
export function planningByClient(entries: PlanningReportEntry[], currentMonth: string): PlanningClientRow[] {
  const groups = new Map<string, PlanningReportEntry[]>();
  for (const entry of entries) groups.set(entry.planningId, [...(groups.get(entry.planningId) ?? []), entry]);
  return [...groups.values()]
    .map((list) => ({
      planningId: list[0].planningId,
      client: list[0].client,
      members: list[0].members,
      entries: list,
      ...summarizePlannings(list, currentMonth),
    }))
    .sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR"));
}

export type PlanningPersonRow = PlanningSummary & { person: PlanningPerson };

/** Um resumo por responsável, pelos planejamentos em que a pessoa está hoje (o vínculo não tem histórico). */
export function planningByPerson(entries: PlanningReportEntry[], currentMonth: string): PlanningPersonRow[] {
  const people = new Map(entries.flatMap((entry) => entry.members).map((person) => [person.id, person]));
  return [...people.values()]
    .map((person) => ({
      person,
      ...summarizePlannings(
        entries.filter((entry) => entry.members.some((member) => member.id === person.id)),
        currentMonth,
      ),
    }))
    .sort((a, b) => b.months - a.months || a.person.name.localeCompare(b.person.name, "pt-BR"));
}

/** Mês a mês: posts, aprovados, meta e situação dos planejamentos. */
export function planningByMonth(entries: PlanningReportEntry[], months: string[], currentMonth: string) {
  return months.map((month) => ({ month, ...summarizePlannings(entries.filter((entry) => entry.month === month), currentMonth) }));
}

/** Quantos meses (cliente × mês) estão em cada status, e quantos posts. */
export function planningStatusCounts(entries: PlanningReportEntry[]) {
  const months = emptyCounts();
  const posts = emptyCounts();
  for (const entry of entries) {
    if (entry.status) months[entry.status]++;
    for (const status of PLANNING_STATUS_KEYS) posts[status] += entry.posts[status];
  }
  return { months, posts, notStarted: entries.filter((entry) => entry.status === null).length };
}

/** Meses atrasados (o mais antigo primeiro). */
export function lateMonths(entries: PlanningReportEntry[], currentMonth: string) {
  return entries
    .filter((entry) => isMonthLate(entry, currentMonth))
    .sort((a, b) => a.month.localeCompare(b.month) || a.client.name.localeCompare(b.client.name, "pt-BR"));
}
