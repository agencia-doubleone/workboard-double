import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import {
  client,
  job,
  jobAssignee,
  jobMessage,
  jobMessageAttachment,
  jobRead,
  jobStatus,
  jobStatusHistory,
  media,
  user,
} from "@/db/schema";
import { DEFAULT_JOB_PAGE_SIZE, type JobSituation } from "@/lib/jobs";

export type JobStatusRecord = typeof jobStatus.$inferSelect;
export type JobRecord = typeof job.$inferSelect;
export type JobPerson = { id: string; name: string; image: string | null };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

// Status

export function listJobStatuses(database: Database) {
  return database.select().from(jobStatus).orderBy(asc(jobStatus.position), asc(jobStatus.createdAt));
}

export async function findJobStatusById(database: Database, id: string) {
  const [found] = await database.select().from(jobStatus).where(eq(jobStatus.id, id)).limit(1);
  return found ?? null;
}

export async function findDefaultJobStatus(database: Database) {
  const [found] = await database
    .select()
    .from(jobStatus)
    .orderBy(desc(jobStatus.isDefault), asc(jobStatus.position))
    .limit(1);
  return found ?? null;
}

export async function countJobsWithStatus(database: Database, statusId: string) {
  const [{ total }] = await database.select({ total: count() }).from(job).where(eq(job.statusId, statusId));
  return total;
}

// Equipe

/** Pessoas ativas (não desativadas), para escolher funcionários e mencionar. */
export async function listTeamMembers(database: Database): Promise<JobPerson[]> {
  const rows = await database
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)));
  return rows.sort((a, b) => collator.compare(a.name, b.name));
}

// Lista

export type JobListFilters = {
  /** Quem está vendo: conta as não lidas e as menções dessa pessoa. */
  viewerId: string;
  situation: JobSituation;
  statusId?: string;
  clientId?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listJobs(database: Database, filters: JobListFilters) {
  const pageSize = filters.pageSize ?? DEFAULT_JOB_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const conditions: SQL[] = [];

  if (filters.situation === "abertos") conditions.push(eq(job.active, true), eq(jobStatus.isFinal, false));
  if (filters.situation === "concluidos") conditions.push(eq(jobStatus.isFinal, true));
  if (filters.situation === "inativos") conditions.push(eq(job.active, false));
  if (filters.statusId) conditions.push(eq(job.statusId, filters.statusId));
  if (filters.clientId) conditions.push(eq(job.clientId, filters.clientId));
  if (filters.assigneeId) {
    conditions.push(
      sql`exists (select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${filters.assigneeId})`,
    );
  }
  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const byText = or(ilike(job.name, pattern), ilike(client.name, pattern))!;
    conditions.push(/^\d{1,9}$/.test(search) ? or(byText, eq(job.pit, Number(search)))! : byText);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  // Mensagens por trabalho: total, não lidas por quem vê e se alguma não lida o menciona.
  const viewer = filters.viewerId;
  const messages = database
    .select({
      jobId: jobMessage.jobId,
      total: count().as("message_total"),
      unread: sql<number>`count(*) filter (where ${jobMessage.createdAt} > coalesce(${jobRead.lastReadAt}, 'epoch') and ${jobMessage.authorId} is distinct from ${viewer})`
        .mapWith(Number)
        .as("message_unread"),
      mentioned: sql<boolean>`bool_or(${jobMessage.createdAt} > coalesce(${jobRead.lastReadAt}, 'epoch') and ${viewer} = any(${jobMessage.mentions}))`.as(
        "message_mentioned",
      ),
    })
    .from(jobMessage)
    .leftJoin(jobRead, and(eq(jobRead.jobId, jobMessage.jobId), eq(jobRead.userId, viewer)))
    .groupBy(jobMessage.jobId)
    .as("messages");

  const [rows, [{ total }]] = await Promise.all([
    database
      .select({
        id: job.id,
        pit: job.pit,
        name: job.name,
        dueDate: job.dueDate,
        active: job.active,
        // Só se existe: o texto completo sai sob demanda (modal do briefing).
        hasBriefing: sql<boolean>`${job.briefing} is not null`,
        createdAt: job.createdAt,
        client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey },
        status: {
          id: jobStatus.id,
          name: jobStatus.name,
          textColor: jobStatus.textColor,
          backgroundColor: jobStatus.backgroundColor,
          isFinal: jobStatus.isFinal,
        },
        messageTotal: sql<number>`coalesce(${messages.total}, 0)`.mapWith(Number),
        messageUnread: sql<number>`coalesce(${messages.unread}, 0)`.mapWith(Number),
        mentioned: sql<boolean>`coalesce(${messages.mentioned}, false)`,
      })
      .from(job)
      .innerJoin(client, eq(client.id, job.clientId))
      .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
      .leftJoin(messages, eq(messages.jobId, job.id))
      .where(where)
      .orderBy(desc(job.pit))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database
      .select({ total: count() })
      .from(job)
      .innerJoin(client, eq(client.id, job.clientId))
      .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
      .where(where),
  ]);

  const assignees = await listAssignees(database, rows.map((row) => row.id));
  return {
    rows: rows.map((row) => ({ ...row, assignees: assignees.get(row.id) ?? [] })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type JobListItem = Awaited<ReturnType<typeof listJobs>>["rows"][number];

/** Funcionários de vários trabalhos de uma vez, em ordem alfabética. */
export async function listAssignees(database: Database, jobIds: string[]) {
  const map = new Map<string, JobPerson[]>();
  if (jobIds.length === 0) return map;
  const rows = await database
    .select({ jobId: jobAssignee.jobId, id: user.id, name: user.name, image: user.image })
    .from(jobAssignee)
    .innerJoin(user, eq(user.id, jobAssignee.userId))
    .where(inArray(jobAssignee.jobId, jobIds));
  for (const row of rows.sort((a, b) => collator.compare(a.name, b.name))) {
    const list = map.get(row.jobId) ?? [];
    list.push({ id: row.id, name: row.name, image: row.image });
    map.set(row.jobId, list);
  }
  return map;
}

// Um trabalho

export async function findJobByPit(database: Database, pit: number) {
  const [found] = await database
    .select({
      job,
      client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey, archivedAt: client.archivedAt },
      status: jobStatus,
    })
    .from(job)
    .innerJoin(client, eq(client.id, job.clientId))
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(eq(job.pit, pit))
    .limit(1);
  if (!found) return null;
  const assignees = await listAssignees(database, [found.job.id]);
  return { ...found, assignees: assignees.get(found.job.id) ?? [] };
}

export async function findJobById(database: Database, id: string) {
  const [found] = await database.select().from(job).where(eq(job.id, id)).limit(1);
  return found ?? null;
}

export async function listJobStatusHistory(database: Database, jobId: string) {
  return database
    .select()
    .from(jobStatusHistory)
    .where(eq(jobStatusHistory.jobId, jobId))
    .orderBy(desc(jobStatusHistory.changedAt));
}

/** Mensagens em ordem de envio, cada uma com os anexos. */
export async function listJobMessages(database: Database, jobId: string) {
  const rows = await database
    .select({
      id: jobMessage.id,
      authorId: jobMessage.authorId,
      authorName: jobMessage.authorName,
      authorImage: user.image,
      body: jobMessage.body,
      createdAt: jobMessage.createdAt,
    })
    .from(jobMessage)
    .leftJoin(user, eq(user.id, jobMessage.authorId))
    .where(eq(jobMessage.jobId, jobId))
    .orderBy(asc(jobMessage.createdAt));
  const attachments = rows.length
    ? await database
        .select({
          messageId: jobMessageAttachment.messageId,
          id: media.id,
          key: media.key,
          name: media.name,
          type: media.type,
          size: media.size,
        })
        .from(jobMessageAttachment)
        .innerJoin(media, eq(media.id, jobMessageAttachment.mediaId))
        .where(inArray(jobMessageAttachment.messageId, rows.map((row) => row.id)))
    : [];
  return rows.map((row) => ({
    ...row,
    attachments: attachments.filter((item) => item.messageId === row.id),
  }));
}

export type JobMessageItem = Awaited<ReturnType<typeof listJobMessages>>[number];

/** Chaves no CDN dos anexos das mensagens de um trabalho (para apagar junto). */
export async function listJobAttachmentKeys(database: Database, jobId: string) {
  const rows = await database
    .select({ key: media.key })
    .from(jobMessageAttachment)
    .innerJoin(jobMessage, eq(jobMessage.id, jobMessageAttachment.messageId))
    .innerJoin(media, eq(media.id, jobMessageAttachment.mediaId))
    .where(eq(jobMessage.jobId, jobId));
  return rows.map((row) => row.key);
}

/** Marca como lidas as mensagens do trabalho para essa pessoa (até agora). */
export async function markJobRead(database: Database, jobId: string, userId: string) {
  await database
    .insert(jobRead)
    .values({ jobId, userId, lastReadAt: new Date() })
    .onConflictDoUpdate({ target: [jobRead.jobId, jobRead.userId], set: { lastReadAt: new Date() } });
}

/** Até quando essa pessoa já leu as mensagens do trabalho (null = nunca abriu). */
export async function getJobLastRead(database: Database, jobId: string, userId: string) {
  const [found] = await database
    .select({ lastReadAt: jobRead.lastReadAt })
    .from(jobRead)
    .where(and(eq(jobRead.jobId, jobId), eq(jobRead.userId, userId)))
    .limit(1);
  return found?.lastReadAt ?? null;
}

/** Nomes de usuários por id (inclui desativados), para menções e autoria. */
export async function findUserNames(database: Database, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, string>();
  const rows = await database.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Anexo já usado em alguma mensagem (não pode ser descartado como rascunho). */
export async function isAttachmentInUse(database: Database, mediaId: string) {
  const [found] = await database
    .select({ messageId: jobMessageAttachment.messageId })
    .from(jobMessageAttachment)
    .where(eq(jobMessageAttachment.mediaId, mediaId))
    .limit(1);
  return Boolean(found);
}

/** Clientes ativos para escolher no trabalho (o atual entra mesmo se arquivado). */
export async function listClientOptions(database: Database, includeId?: string) {
  const rows = await database
    .select({ id: client.id, name: client.name, logoKey: client.logoKey })
    .from(client)
    .where(includeId ? or(isNull(client.archivedAt), eq(client.id, includeId)) : isNull(client.archivedAt));
  return rows.sort((a, b) => collator.compare(a.name, b.name));
}

/** Usuários válidos (ativos) entre os ids informados. */
export async function filterActiveUserIds(database: Database, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await database
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, ids), or(isNull(user.banned), ne(user.banned, true))));
  return rows.map((row) => row.id);
}

/** Quantos trabalhos usam cada status (para a tela de status). */
export async function countJobsByStatus(database: Database) {
  const rows = await database
    .select({ statusId: job.statusId, total: count() })
    .from(job)
    .groupBy(job.statusId);
  return new Map(rows.map((row) => [row.statusId, row.total]));
}
