import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import { auditLog } from "@/db/schema";
import { getActionsByCategory, type AuditAction, type AuditCategory } from "@/lib/audit";

export const AUDIT_PAGE_SIZE = 50;

export type AuditLogFilters = {
  category?: AuditCategory;
  action?: AuditAction;
  /** Busca em ator (nome/e-mail) e alvo. */
  search?: string;
  /** Histórico de um registro específico (ex.: um trabalho). */
  entity?: { type: string; id: string };
  page?: number;
};

export async function listAuditLogs(database: Database, filters: AuditLogFilters) {
  const conditions: SQL[] = [];

  if (filters.action) {
    conditions.push(eq(auditLog.action, filters.action));
  } else if (filters.category) {
    conditions.push(inArray(auditLog.action, getActionsByCategory(filters.category)));
  }

  if (filters.entity) {
    conditions.push(
      eq(auditLog.entityType, filters.entity.type),
      eq(auditLog.entityId, filters.entity.id),
    );
  }

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(auditLog.actorName, pattern),
        ilike(auditLog.actorEmail, pattern),
        ilike(auditLog.entityLabel, pattern),
      )!,
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, filters.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    database
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    database.select({ total: count() }).from(auditLog).where(where),
  ]);

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}

export type AuditLogRow = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];
