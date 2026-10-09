import { and, asc, count, eq, gt, max, ne, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { auditLog, session, user } from "@/db/schema";

/** Usuários com último login (da auditoria) e sessões ativas. */
export async function listUsers(database: Database) {
  const lastSignIn = database
    .select({
      actorId: auditLog.actorId,
      at: max(auditLog.createdAt).as("last_sign_in_at"),
    })
    .from(auditLog)
    .where(eq(auditLog.action, "auth.sign_in"))
    .groupBy(auditLog.actorId)
    .as("last_sign_in");

  const activeSessions = database
    .select({
      userId: session.userId,
      total: count().as("active_sessions"),
    })
    .from(session)
    .where(gt(session.expiresAt, sql`now()`))
    .groupBy(session.userId)
    .as("active");

  return database
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
      lastSignInAt: lastSignIn.at,
      activeSessions: sql<number>`coalesce(${activeSessions.total}, 0)`.mapWith(Number),
    })
    .from(user)
    .leftJoin(lastSignIn, eq(lastSignIn.actorId, user.id))
    .leftJoin(activeSessions, eq(activeSessions.userId, user.id))
    .orderBy(asc(user.name));
}

export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];

export async function findUserById(database: Database, id: string) {
  const [found] = await database.select().from(user).where(eq(user.id, id)).limit(1);
  return found ?? null;
}

export async function isEmailTaken(database: Database, email: string, exceptUserId?: string) {
  const [found] = await database
    .select({ id: user.id })
    .from(user)
    .where(exceptUserId ? and(eq(user.email, email), ne(user.id, exceptUserId)) : eq(user.email, email))
    .limit(1);
  return Boolean(found);
}

export async function countActiveSessions(database: Database, userId: string) {
  const [{ total }] = await database
    .select({ total: count() })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, sql`now()`)));
  return total;
}
