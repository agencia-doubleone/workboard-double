import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { client, planning, planningMember, planningMonth, planningPost, user } from "@/db/schema";
import { isApprovedStatus, type PlanningStatus } from "@/lib/planning";

// Consultas dos planejamentos (sem "server-only": também rodam nos scripts de
// verificação contra PGlite). Toda a equipe vê e edita; não há checagem de acesso aqui.

export type PlanningRecord = typeof planning.$inferSelect;
export type PlanningMonthRecord = typeof planningMonth.$inferSelect;
export type PlanningPostRecord = typeof planningPost.$inferSelect;
export type PlanningPerson = { id: string; name: string; image: string | null };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Os responsáveis de cada planejamento, em ordem de nome. */
export async function listPlanningMembers(database: Database, planningIds: string[]) {
  const map = new Map<string, PlanningPerson[]>();
  if (planningIds.length === 0) return map;
  const rows = await database
    .select({ planningId: planningMember.planningId, id: user.id, name: user.name, image: user.image })
    .from(planningMember)
    .innerJoin(user, eq(user.id, planningMember.userId))
    .where(inArray(planningMember.planningId, planningIds));
  for (const row of rows.sort((a, b) => collator.compare(a.name, b.name))) {
    map.set(row.planningId, [...(map.get(row.planningId) ?? []), { id: row.id, name: row.name, image: row.image }]);
  }
  return map;
}

/**
 * A lista do mês: todos os planejamentos (clientes ativos, e os arquivados que
 * já têm algo no mês) com o status do mês e quantos posts estão em cada situação.
 */
export async function listPlanningsForMonth(database: Database, month: string) {
  const rows = await database
    .select({
      id: planning.id,
      networks: planning.networks,
      postsPerMonth: planning.postsPerMonth,
      client: { id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey, archivedAt: client.archivedAt },
      monthId: planningMonth.id,
      monthStatus: planningMonth.status,
      monthStatusChangedAt: planningMonth.statusChangedAt,
    })
    .from(planning)
    .innerJoin(client, eq(client.id, planning.clientId))
    .leftJoin(planningMonth, and(eq(planningMonth.planningId, planning.id), eq(planningMonth.month, month)));

  const monthIds = rows.flatMap((row) => (row.monthId ? [row.monthId] : []));
  const [posts, members] = await Promise.all([
    monthIds.length
      ? database
          .select({ monthId: planningPost.monthId, status: planningPost.status, date: planningPost.date })
          .from(planningPost)
          .where(inArray(planningPost.monthId, monthIds))
      : Promise.resolve([]),
    listPlanningMembers(database, rows.map((row) => row.id)),
  ]);

  return rows
    .filter((row) => !row.client.archivedAt || row.monthId)
    .map((row) => {
      const mine = posts.filter((post) => post.monthId === row.monthId);
      return {
        ...row,
        posts: {
          total: mine.length,
          approved: mine.filter((post) => isApprovedStatus(post.status)).length,
          adjustments: mine.filter((post) => post.status === "ajustes").length,
        },
        members: members.get(row.id) ?? [],
      };
    })
    .sort((a, b) => collator.compare(a.client.name, b.client.name));
}

export type PlanningListItem = Awaited<ReturnType<typeof listPlanningsForMonth>>[number];

async function findPlanning(database: Database, where: ReturnType<typeof eq>) {
  const [found] = await database
    .select({
      planning,
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        logoKey: client.logoKey,
        instagram: client.instagram,
        archivedAt: client.archivedAt,
      },
    })
    .from(planning)
    .innerJoin(client, eq(client.id, planning.clientId))
    .where(where)
    .limit(1);
  if (!found) return null;
  const members = await listPlanningMembers(database, [found.planning.id]);
  return { ...found, members: members.get(found.planning.id) ?? [] };
}

/** O planejamento pelo endereço do cliente (/planejamentos/{slug}). */
export function findPlanningBySlug(database: Database, slug: string) {
  return findPlanning(database, eq(client.slug, slug));
}

export function findPlanningById(database: Database, id: string) {
  return findPlanning(database, eq(planning.id, id));
}

export type PlanningWithClient = NonNullable<Awaited<ReturnType<typeof findPlanningById>>>;

export async function findPlanningMonth(database: Database, planningId: string, month: string) {
  const [found] = await database
    .select()
    .from(planningMonth)
    .where(and(eq(planningMonth.planningId, planningId), eq(planningMonth.month, month)))
    .limit(1);
  return found ?? null;
}

/** O mês, criando se ainda não existe (meses nascem quando alguém mexe neles). */
export async function ensurePlanningMonth(database: Database, planningId: string, month: string) {
  await database.insert(planningMonth).values({ planningId, month }).onConflictDoNothing();
  return (await findPlanningMonth(database, planningId, month))!;
}

/** Posts do mês: por data (os sem data no fim) e, no mesmo dia, pela ordem de criação/importação. */
export function listPlanningPosts(database: Database, monthId: string) {
  return database
    .select()
    .from(planningPost)
    .where(eq(planningPost.monthId, monthId))
    .orderBy(sql`${planningPost.date} asc nulls last`, asc(planningPost.position), asc(planningPost.createdAt));
}

/** Um post com o mês e o planejamento dele. */
export async function findPlanningPost(database: Database, postId: string) {
  const [found] = await database
    .select({ post: planningPost, month: planningMonth })
    .from(planningPost)
    .innerJoin(planningMonth, eq(planningMonth.id, planningPost.monthId))
    .where(eq(planningPost.id, postId))
    .limit(1);
  return found ?? null;
}

/** Próxima posição no fim do mês (posts novos e importados entram depois dos que já existem). */
export async function nextPostPosition(database: Database, monthId: string) {
  const [row] = await database
    .select({ last: sql<number | null>`max(${planningPost.position})` })
    .from(planningPost)
    .where(eq(planningPost.monthId, monthId));
  return (row?.last ?? -1) + 1;
}

/** Clientes ativos que ainda não têm planejamento (para criar um). */
export async function listClientsWithoutPlanning(database: Database) {
  const rows = await database
    .select({ id: client.id, name: client.name, logoKey: client.logoKey })
    .from(client)
    .leftJoin(planning, eq(planning.clientId, client.id))
    .where(and(isNull(client.archivedAt), isNull(planning.id)));
  return rows.sort((a, b) => collator.compare(a.name, b.name));
}

/** Responsáveis ativos (quem recebe os avisos). */
export async function listActiveMemberIds(database: Database, planningId: string) {
  const rows = await database
    .select({ id: planningMember.userId })
    .from(planningMember)
    .innerJoin(user, eq(user.id, planningMember.userId))
    .where(and(eq(planningMember.planningId, planningId), or(isNull(user.banned), ne(user.banned, true))));
  return rows.map((row) => row.id);
}

/** Quantos posts de cada status o mês tem (para o resumo). */
export function countByStatus(posts: { status: PlanningStatus }[]) {
  const counts: Partial<Record<PlanningStatus, number>> = {};
  for (const post of posts) counts[post.status] = (counts[post.status] ?? 0) + 1;
  return counts;
}
