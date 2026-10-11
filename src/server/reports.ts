import { and, asc, count, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { client, job, jobAssignee, jobMessage, jobStatus, jobStatusHistory, user } from "@/db/schema";
import { dayKey } from "@/lib/format";
import { addDays, dayDiff, STALLED_AFTER_DAYS, UPCOMING_DAYS, type Period } from "@/lib/reports";
import { listAssignees, type JobPerson } from "@/server/jobs";

// Relatórios (admins). Os dados são lidos de uma vez (loadReportJobs) e as
// contas são funções puras sobre eles; as definições estão em src/lib/reports.ts.
// Trabalhos cancelados (status de cancelamento) ficam fora de tudo.
// Sem "server-only": também roda nos scripts de verificação contra PGlite.

const DAY_MS = 86_400_000;

export type ReportJob = {
  id: string;
  pit: number;
  name: string;
  client: { id: string; name: string; slug: string; logoKey: string | null };
  active: boolean;
  dueDate: string | null;
  createdAt: Date;
  statusChangedAt: Date;
  status: { id: string; name: string; textColor: string; backgroundColor: string; isFinal: boolean; position: number };
  assignees: JobPerson[];
};

/**
 * Todos os trabalhos com cliente, status e funcionários (a base de todos os
 * relatórios e da tela de Início), menos os cancelados. Com `assigneeId`, só os dessa pessoa.
 */
export async function loadReportJobs(database: Database, { assigneeId }: { assigneeId?: string } = {}): Promise<ReportJob[]> {
  const rows = await database
    .select({
      id: job.id,
      pit: job.pit,
      name: job.name,
      client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey },
      active: job.active,
      dueDate: job.dueDate,
      createdAt: job.createdAt,
      statusChangedAt: job.statusChangedAt,
      status: {
        id: jobStatus.id,
        name: jobStatus.name,
        textColor: jobStatus.textColor,
        backgroundColor: jobStatus.backgroundColor,
        isFinal: jobStatus.isFinal,
        position: jobStatus.position,
      },
    })
    .from(job)
    .innerJoin(client, eq(client.id, job.clientId))
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(
      and(
        eq(jobStatus.isCanceled, false),
        assigneeId
          ? sql`exists (select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${assigneeId})`
          : undefined,
      ),
    )
    .orderBy(asc(job.pit));
  const assignees = await listAssignees(database, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, assignees: assignees.get(row.id) ?? [] }));
}

/** Período em instantes: do começo do primeiro dia ao fim do último, no fuso da agência (UTC-3, sem horário de verão). */
export function periodBounds(period: Period) {
  return {
    start: new Date(`${period.from}T00:00:00.000-03:00`),
    end: new Date(`${period.to}T23:59:59.999-03:00`),
  };
}

type Bounds = ReturnType<typeof periodBounds>;

const within = (date: Date, bounds: Bounds) => date >= bounds.start && date <= bounds.end;

export const isOpen = (item: ReportJob) => item.active && !item.status.isFinal;
export const isOverdueNow = (item: ReportJob, today: string) => isOpen(item) && Boolean(item.dueDate) && item.dueDate! < today;
export const isCreatedIn = (item: ReportJob, bounds: Bounds) => within(item.createdAt, bounds);
export const isConcludedIn = (item: ReportJob, bounds: Bounds) => item.status.isFinal && within(item.statusChangedAt, bounds);

/** Dia (fuso da agência) em que o trabalho foi concluído. */
export const concludedDay = (item: ReportJob) => dayKey(item.statusChangedAt);

/** Concluído no prazo, com atraso, ou sem data de entrega para comparar. */
export function deliveryOutcome(item: ReportJob): "on-time" | "late" | "no-due" {
  if (!item.dueDate) return "no-due";
  return concludedDay(item) <= item.dueDate ? "on-time" : "late";
}

/** Dias da criação até a conclusão. */
export const cycleDays = (item: ReportJob) => (item.statusChangedAt.getTime() - item.createdAt.getTime()) / DAY_MS;

export type JobSummary = {
  created: number;
  concluded: number;
  onTime: number;
  late: number;
  /** Fração dos concluídos com prazo que saíram no prazo (null sem nenhum com prazo). */
  onTimeRate: number | null;
  /** Média de dias da criação à conclusão (null sem concluídos). */
  avgCycleDays: number | null;
  open: number;
  overdue: number;
};

/** Os números de um grupo de trabalhos no período (e o retrato de agora: em aberto e atrasados). */
export function summarize(jobs: ReportJob[], bounds: Bounds, today: string): JobSummary {
  const concluded = jobs.filter((item) => isConcludedIn(item, bounds));
  const onTime = concluded.filter((item) => deliveryOutcome(item) === "on-time").length;
  const late = concluded.filter((item) => deliveryOutcome(item) === "late").length;
  return {
    created: jobs.filter((item) => isCreatedIn(item, bounds)).length,
    concluded: concluded.length,
    onTime,
    late,
    onTimeRate: onTime + late > 0 ? onTime / (onTime + late) : null,
    avgCycleDays: concluded.length > 0 ? concluded.reduce((total, item) => total + cycleDays(item), 0) / concluded.length : null,
    open: jobs.filter(isOpen).length,
    overdue: jobs.filter((item) => isOverdueNow(item, today)).length,
  };
}

export type TimelineBucket = { label: string; from: string; to: string; created: number; concluded: number };

/** Criados e concluídos por semana (períodos de até ~3 meses) ou por mês. */
export function timeline(jobs: ReportJob[], period: Period): TimelineBucket[] {
  const monthly = dayDiff(period.from, period.to) > 92;
  const buckets: TimelineBucket[] = [];
  let cursor = period.from;
  while (cursor <= period.to) {
    let end: string;
    let label: string;
    if (monthly) {
      const nextMonth = addDays(`${cursor.slice(0, 7)}-01`, 32).slice(0, 7);
      end = addDays(`${nextMonth}-01`, -1);
      const [year, month] = cursor.split("-");
      label = `${month}/${year.slice(2)}`;
    } else {
      end = addDays(cursor, 6);
      label = cursor.slice(8, 10) + "/" + cursor.slice(5, 7);
    }
    if (end > period.to) end = period.to;
    buckets.push({ label, from: cursor, to: end, created: 0, concluded: 0 });
    cursor = addDays(end, 1);
  }
  for (const item of jobs) {
    const created = dayKey(item.createdAt);
    const bucket = buckets.find((candidate) => created >= candidate.from && created <= candidate.to);
    if (bucket) bucket.created++;
    if (item.status.isFinal) {
      const concluded = concludedDay(item);
      const target = buckets.find((candidate) => concluded >= candidate.from && concluded <= candidate.to);
      if (target) target.concluded++;
    }
  }
  return buckets;
}

/** Trabalhos em aberto agora, por status (na ordem do cadastro). */
export function openByStatus(jobs: ReportJob[]) {
  const groups = new Map<string, { status: ReportJob["status"]; count: number }>();
  for (const item of jobs.filter(isOpen)) {
    const group = groups.get(item.status.id) ?? { status: item.status, count: 0 };
    group.count++;
    groups.set(item.status.id, group);
  }
  return [...groups.values()].sort((a, b) => a.status.position - b.status.position);
}

export type ClientReportRow = JobSummary & { client: ReportJob["client"] };

/** Um resumo por cliente, só dos que tiveram movimento no período ou têm trabalho em aberto. */
export function byClient(jobs: ReportJob[], bounds: Bounds, today: string): ClientReportRow[] {
  const groups = new Map<string, ReportJob[]>();
  for (const item of jobs) groups.set(item.client.id, [...(groups.get(item.client.id) ?? []), item]);
  return [...groups.values()]
    .map((list) => ({ client: list[0].client, ...summarize(list, bounds, today) }))
    .filter((row) => row.created > 0 || row.concluded > 0 || row.open > 0)
    .sort((a, b) => b.created + b.concluded - (a.created + a.concluded) || b.open - a.open);
}

/** Os trabalhos de um cliente que importam no período: criados, concluídos ou ainda em aberto. */
export function clientJobs(jobs: ReportJob[], clientId: string, bounds: Bounds) {
  return jobs
    .filter((item) => item.client.id === clientId)
    .filter((item) => isCreatedIn(item, bounds) || isConcludedIn(item, bounds) || isOpen(item))
    .sort((a, b) => b.pit - a.pit);
}

export type PersonReportRow = JobSummary & { person: JobPerson; messages: number };

/**
 * Um resumo por pessoa, pelos trabalhos em que ela está hoje (o vínculo não tem
 * histórico), com as mensagens que mandou no período.
 */
export function byPerson(
  jobs: ReportJob[],
  people: JobPerson[],
  bounds: Bounds,
  today: string,
  messages: Map<string, number>,
): PersonReportRow[] {
  return people
    .map((person) => ({
      person,
      messages: messages.get(person.id) ?? 0,
      ...summarize(
        jobs.filter((item) => item.assignees.some((assignee) => assignee.id === person.id)),
        bounds,
        today,
      ),
    }))
    .sort((a, b) => b.concluded - a.concluded || b.open - a.open);
}

/** Prazos: atrasados e próximos (agora), em aberto sem entrega e concluídos com atraso no período. */
export function deadlines(jobs: ReportJob[], bounds: Bounds, today: string) {
  const limit = addDays(today, UPCOMING_DAYS);
  return {
    overdue: jobs
      .filter((item) => isOverdueNow(item, today))
      .map((item) => ({ job: item, days: dayDiff(item.dueDate!, today) }))
      .sort((a, b) => b.days - a.days),
    upcoming: jobs
      .filter((item) => isOpen(item) && item.dueDate && item.dueDate >= today && item.dueDate <= limit)
      .map((item) => ({ job: item, days: dayDiff(today, item.dueDate!) }))
      .sort((a, b) => a.days - b.days),
    noDueDate: jobs.filter((item) => isOpen(item) && !item.dueDate).sort((a, b) => b.pit - a.pit),
    concludedLate: jobs
      .filter((item) => isConcludedIn(item, bounds) && deliveryOutcome(item) === "late")
      .map((item) => ({ job: item, days: dayDiff(item.dueDate!, concludedDay(item)) }))
      .sort((a, b) => b.days - a.days),
  };
}

/** Em aberto e sem mudar de status há STALLED_AFTER_DAYS dias ou mais (o mais parado primeiro). */
export function stalledJobs(jobs: ReportJob[], now: Date) {
  return jobs
    .filter(isOpen)
    .map((item) => ({ job: item, days: (now.getTime() - item.statusChangedAt.getTime()) / DAY_MS }))
    .filter((entry) => entry.days >= STALLED_AFTER_DAYS)
    .sort((a, b) => b.days - a.days);
}

export type StageRow = {
  name: string;
  textColor: string;
  backgroundColor: string;
  /** Quantos dos trabalhos concluídos passaram por esse status. */
  jobs: number;
  /** Média de dias nesse status, entre os que passaram por ele. */
  avgDays: number;
};

/**
 * Quanto tempo os trabalhos concluídos no período ficaram em cada etapa até
 * concluir, pelo histórico de status (nome e cores copiados na época). O tempo
 * no status final não conta.
 */
export async function stageDurations(database: Database, concluded: ReportJob[]): Promise<StageRow[]> {
  if (concluded.length === 0) return [];
  const history = await database
    .select({
      jobId: jobStatusHistory.jobId,
      name: jobStatusHistory.statusName,
      textColor: jobStatusHistory.textColor,
      backgroundColor: jobStatusHistory.backgroundColor,
      changedAt: jobStatusHistory.changedAt,
    })
    .from(jobStatusHistory)
    .where(inArray(jobStatusHistory.jobId, concluded.map((item) => item.id)))
    .orderBy(asc(jobStatusHistory.jobId), asc(jobStatusHistory.changedAt));

  type Accumulator = {
    name: string;
    textColor: string;
    backgroundColor: string;
    totalDays: number;
    jobs: Set<string>;
    /** Soma das posições no histórico: a média ordena as etapas na ordem do fluxo. */
    positions: number;
    entries: number;
  };
  const stages = new Map<string, Accumulator>();
  const byJob = new Map<string, typeof history>();
  for (const entry of history) byJob.set(entry.jobId, [...(byJob.get(entry.jobId) ?? []), entry]);
  for (const entries of byJob.values()) {
    entries.forEach((entry, index) => {
      const next = entries[index + 1];
      if (!next) return; // a última entrada é o status final
      const stage = stages.get(entry.name) ?? {
        name: entry.name,
        textColor: entry.textColor,
        backgroundColor: entry.backgroundColor,
        totalDays: 0,
        jobs: new Set<string>(),
        positions: 0,
        entries: 0,
      };
      stage.totalDays += (next.changedAt.getTime() - entry.changedAt.getTime()) / DAY_MS;
      stage.jobs.add(entry.jobId);
      stage.positions += index;
      stage.entries++;
      stages.set(entry.name, stage);
    });
  }
  return [...stages.values()]
    .sort((a, b) => a.positions / a.entries - b.positions / b.entries)
    .map((stage) => ({
      name: stage.name,
      textColor: stage.textColor,
      backgroundColor: stage.backgroundColor,
      jobs: stage.jobs.size,
      avgDays: stage.totalDays / stage.jobs.size,
    }));
}

/** Mensagens que cada pessoa mandou nos trabalhos (menos os cancelados) no período. */
export async function countMessagesByAuthor(database: Database, bounds: Bounds) {
  const rows = await database
    .select({ authorId: jobMessage.authorId, total: count() })
    .from(jobMessage)
    .innerJoin(job, eq(job.id, jobMessage.jobId))
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(
      and(
        isNotNull(jobMessage.authorId),
        eq(jobStatus.isCanceled, false),
        gte(jobMessage.createdAt, bounds.start),
        lte(jobMessage.createdAt, bounds.end),
      ),
    )
    .groupBy(jobMessage.authorId);
  return new Map(rows.map((row) => [row.authorId!, row.total]));
}

/** Pessoas para o relatório da equipe: todas, menos as desativadas sem nenhum trabalho. */
export async function listReportPeople(database: Database, jobs: ReportJob[]) {
  const rows = await database
    .select({ id: user.id, name: user.name, image: user.image, banned: user.banned })
    .from(user);
  const assigned = new Set(jobs.flatMap((item) => item.assignees.map((person) => person.id)));
  return rows
    .filter((row) => !row.banned || assigned.has(row.id))
    .map((row) => ({ id: row.id, name: row.name, image: row.image }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
