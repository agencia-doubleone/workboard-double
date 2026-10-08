import type { Database } from "@/db";
import { auditLog } from "@/db/schema";
import type { AuditAction, AuditEntityType } from "@/lib/audit";

// Sem "server-only": também é usado pela config do Better Auth e pelo seed.

export type AuditActor = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type AuditEntry = {
  action: AuditAction;
  /** null = sistema ou visitante não autenticado. */
  actor: AuditActor | null;
  entity?: { type: AuditEntityType; id: string; label?: string | null };
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type RecordAudit = (entry: AuditEntry) => Promise<void>;

export function createAuditRecorder(database: Database): RecordAudit {
  return async function recordAudit(entry) {
    try {
      await database.insert(auditLog).values({
        action: entry.action,
        actorId: entry.actor?.id ?? null,
        actorName: entry.actor?.name ?? null,
        actorEmail: entry.actor?.email ?? null,
        entityType: entry.entity?.type ?? null,
        entityId: entry.entity?.id ?? null,
        entityLabel: entry.entity?.label ?? null,
        metadata: entry.metadata ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      });
    } catch (error) {
      // Auditoria nunca derruba a operação principal (ex.: login).
      console.error("[audit] falha ao registrar", entry.action, error);
    }
  };
}

/** IP e user agent de uma requisição (Vercel preenche x-forwarded-for). */
export function getRequestMeta(headers: Headers | null | undefined) {
  if (!headers) return { ipAddress: null, userAgent: null };
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwardedFor || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export function userEntity(target: { id: string; email: string }) {
  return { type: "user" as const, id: target.id, label: target.email };
}
