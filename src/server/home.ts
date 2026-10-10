import { and, desc, eq, gt, gte, inArray, max, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { job, jobAssignee, jobMessage, jobRead, jobStatusHistory, notification } from "@/db/schema";

// Consultas da tela de Início ("Meu dia"). Sempre do ponto de vista de uma
// pessoa e dos trabalhos em que ela está (sem "server-only": também rodam nos
// scripts de verificação contra PGlite).

/** Antes disso, uma troca de status não é "cadastro" (o histórico inicial nasce junto com o trabalho). */
const CREATION_WINDOW_MS = 5_000;

/**
 * Trabalhos em que a pessoa está e que têm mensagem de outras pessoas depois da
 * última leitura dela: quantas, se alguma a menciona e a última.
 */
export async function listUnreadJobThreads(database: Database, userId: string) {
  const unreadSince = sql`coalesce(${jobRead.lastReadAt}, 'epoch')`;
  const filters = and(
    sql`${jobMessage.authorId} is distinct from ${userId}`,
    gt(jobMessage.createdAt, unreadSince),
  );
  const threads = await database
    .select({
      jobId: jobMessage.jobId,
      pit: job.pit,
      name: job.name,
      unread: sql<number>`count(*)`.mapWith(Number),
      mentioned: sql<boolean>`bool_or(${userId} = any(${jobMessage.mentions}))`,
      lastAt: max(jobMessage.createdAt),
    })
    .from(jobMessage)
    .innerJoin(job, eq(job.id, jobMessage.jobId))
    .innerJoin(jobAssignee, and(eq(jobAssignee.jobId, jobMessage.jobId), eq(jobAssignee.userId, userId)))
    .leftJoin(jobRead, and(eq(jobRead.jobId, jobMessage.jobId), eq(jobRead.userId, userId)))
    .where(filters)
    .groupBy(jobMessage.jobId, job.pit, job.name)
    .orderBy(desc(max(jobMessage.createdAt)));
  if (threads.length === 0) return [];

  const last = await database
    .selectDistinctOn([jobMessage.jobId], {
      jobId: jobMessage.jobId,
      authorName: jobMessage.authorName,
      body: jobMessage.body,
    })
    .from(jobMessage)
    .where(and(inArray(jobMessage.jobId, threads.map((thread) => thread.jobId)), sql`${jobMessage.authorId} is distinct from ${userId}`))
    .orderBy(jobMessage.jobId, desc(jobMessage.createdAt));

  return threads.map((thread) => {
    const latest = last.find((item) => item.jobId === thread.jobId);
    return {
      ...thread,
      mentioned: Boolean(thread.mentioned),
      lastAt: thread.lastAt!,
      lastAuthor: latest?.authorName ?? "",
      lastBody: latest?.body ?? "",
    };
  });
}

export type ActivityItem =
  | {
      kind: "status";
      at: Date;
      actorName: string | null;
      pit: number;
      jobName: string;
      status: { name: string; textColor: string; backgroundColor: string };
      /** A primeira entrada do histórico: o trabalho foi cadastrado. */
      created: boolean;
    }
  | { kind: "messages"; at: Date; actorName: string; pit: number; jobName: string; count: number; authors: number }
  | { kind: "assigned"; at: Date; actorName: string | null; pit: number; jobName: string };

/**
 * O que outras pessoas fizeram nos trabalhos da pessoa desde `since`: trocas de
 * status (e cadastros), mensagens (somadas por trabalho) e quando a incluíram.
 * As ações da própria pessoa ficam de fora.
 */
export async function listRecentActivity(database: Database, userId: string, since: Date, limit = 12) {
  const mine = and(eq(jobAssignee.jobId, job.id), eq(jobAssignee.userId, userId));
  const [statuses, messages, latestAuthors, assigned] = await Promise.all([
    database
      .select({
        at: jobStatusHistory.changedAt,
        actorName: jobStatusHistory.changedByName,
        pit: job.pit,
        jobName: job.name,
        createdAt: job.createdAt,
        statusName: jobStatusHistory.statusName,
        textColor: jobStatusHistory.textColor,
        backgroundColor: jobStatusHistory.backgroundColor,
      })
      .from(jobStatusHistory)
      .innerJoin(job, eq(job.id, jobStatusHistory.jobId))
      .innerJoin(jobAssignee, mine)
      .where(
        and(gte(jobStatusHistory.changedAt, since), sql`${jobStatusHistory.changedById} is distinct from ${userId}`),
      )
      .orderBy(desc(jobStatusHistory.changedAt))
      .limit(limit),
    database
      .select({
        jobId: job.id,
        pit: job.pit,
        jobName: job.name,
        count: sql<number>`count(*)`.mapWith(Number),
        authors: sql<number>`count(distinct ${jobMessage.authorId})`.mapWith(Number),
        at: max(jobMessage.createdAt),
      })
      .from(jobMessage)
      .innerJoin(job, eq(job.id, jobMessage.jobId))
      .innerJoin(jobAssignee, mine)
      .where(and(gte(jobMessage.createdAt, since), sql`${jobMessage.authorId} is distinct from ${userId}`))
      .groupBy(job.id, job.pit, job.name)
      .orderBy(desc(max(jobMessage.createdAt)))
      .limit(limit),
    database
      .selectDistinctOn([jobMessage.jobId], { jobId: jobMessage.jobId, authorName: jobMessage.authorName })
      .from(jobMessage)
      .innerJoin(jobAssignee, and(eq(jobAssignee.jobId, jobMessage.jobId), eq(jobAssignee.userId, userId)))
      .where(and(gte(jobMessage.createdAt, since), sql`${jobMessage.authorId} is distinct from ${userId}`))
      .orderBy(jobMessage.jobId, desc(jobMessage.createdAt)),
    // "Incluiu você": vem das notificações (o vínculo não guarda a data).
    database
      .select({
        at: notification.createdAt,
        actorName: notification.actorName,
        data: notification.data,
      })
      .from(notification)
      .where(
        and(eq(notification.userId, userId), eq(notification.type, "job.assigned"), gte(notification.createdAt, since)),
      )
      .orderBy(desc(notification.createdAt))
      .limit(limit),
  ]);

  const items: ActivityItem[] = [
    ...statuses.map((row) => ({
      kind: "status" as const,
      at: row.at,
      actorName: row.actorName,
      pit: row.pit,
      jobName: row.jobName,
      status: { name: row.statusName, textColor: row.textColor, backgroundColor: row.backgroundColor },
      created: Math.abs(row.at.getTime() - row.createdAt.getTime()) < CREATION_WINDOW_MS,
    })),
    ...messages.map((row) => ({
      kind: "messages" as const,
      at: row.at!,
      actorName: latestAuthors.find((item) => item.jobId === row.jobId)?.authorName ?? "Alguém",
      pit: row.pit,
      jobName: row.jobName,
      count: row.count,
      authors: row.authors,
    })),
    ...assigned
      .filter((row) => row.data.pit)
      .map((row) => ({
        kind: "assigned" as const,
        at: row.at,
        actorName: row.actorName,
        pit: row.data.pit!,
        jobName: row.data.jobName ?? "",
      })),
  ];
  // Quem foi incluído no trabalho recebe "incluiu você" no lugar do "cadastrou" do mesmo momento.
  const assignedPits = new Set(items.filter((item) => item.kind === "assigned").map((item) => item.pit));
  return items
    .filter((item) => !(item.kind === "status" && item.created && assignedPits.has(item.pit)))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
