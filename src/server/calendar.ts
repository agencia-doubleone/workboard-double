import { and, asc, eq, gte, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import { client, clientDate, job, jobAssignee, jobStatus, user } from "@/db/schema";
import { listAssignees } from "@/server/jobs";

// Consultas do calendário (sem "server-only": também rodam nos scripts de
// verificação contra PGlite). Quem não é admin só vê os próprios trabalhos:
// a página passa o próprio id em `assigneeId`. Cancelados nunca entram.

export async function listJobsDue(
  database: Database,
  filters: {
    /** Dias "AAAA-MM-DD", inclusive. */
    from: string;
    to: string;
    /** Só os trabalhos dessa pessoa. */
    assigneeId?: string;
    /** Só ativos e com status que não encerra ("Em aberto"). */
    openOnly: boolean;
  },
) {
  const conditions: SQL[] = [
    isNotNull(job.dueDate),
    gte(job.dueDate, filters.from),
    lte(job.dueDate, filters.to),
    eq(jobStatus.isCanceled, false),
  ];
  if (filters.openOnly) conditions.push(eq(job.active, true), eq(jobStatus.isFinal, false));
  if (filters.assigneeId) {
    conditions.push(
      sql`exists (select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${filters.assigneeId})`,
    );
  }
  const rows = await database
    .select({
      id: job.id,
      pit: job.pit,
      name: job.name,
      dueDate: job.dueDate,
      active: job.active,
      client: { name: client.name, logoKey: client.logoKey },
      status: {
        name: jobStatus.name,
        textColor: jobStatus.textColor,
        backgroundColor: jobStatus.backgroundColor,
        isFinal: jobStatus.isFinal,
      },
    })
    .from(job)
    .innerJoin(client, eq(client.id, job.clientId))
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(and(...conditions))
    .orderBy(asc(job.dueDate), asc(job.pit));
  const assignees = await listAssignees(database, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, dueDate: row.dueDate!, assignees: assignees.get(row.id) ?? [] }));
}

export type DueJobItem = Awaited<ReturnType<typeof listJobsDue>>[number];

/** Aniversários da equipe ativa (quem tem a data cadastrada no perfil). */
export async function listBirthdays(database: Database) {
  const rows = await database
    .select({ id: user.id, name: user.name, image: user.image, birthday: user.birthday })
    .from(user)
    .where(and(isNotNull(user.birthday), or(isNull(user.banned), ne(user.banned, true))));
  return rows.map((row) => ({ ...row, birthday: row.birthday! }));
}

/**
 * Fundação e datas importantes dos clientes ativos (arquivado sai do
 * calendário). A página decide em que dias cada uma cai (occasionOccurrences).
 */
export async function listClientOccasions(database: Database) {
  const clientFields = { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey };
  const [founded, dates] = await Promise.all([
    database
      .select({ ...clientFields, foundedOn: client.foundedOn })
      .from(client)
      .where(and(isNull(client.archivedAt), isNotNull(client.foundedOn))),
    database
      .select({
        id: clientDate.id,
        label: clientDate.label,
        date: clientDate.date,
        yearly: clientDate.yearly,
        client: clientFields,
      })
      .from(clientDate)
      .innerJoin(client, eq(client.id, clientDate.clientId))
      .where(isNull(client.archivedAt)),
  ]);
  return { founded: founded.map((row) => ({ ...row, foundedOn: row.foundedOn! })), dates };
}
