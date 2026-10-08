import {
  AUDIT_ENTITY_TYPES,
  AUDIT_FIELD_LABELS,
  getAuditActionDefinition,
  type AuditChanges,
} from "@/lib/audit";
import { formatDateTime, formatRelative } from "@/lib/format";
import { isRole, ROLE_LABELS } from "@/lib/users";
import type { AuditLogRow } from "@/server/audit/queries";
import type { AuditRow } from "./types";

const SIGN_IN_FAILURE_REASONS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos",
  BANNED_USER: "Conta desativada",
  EMAIL_NOT_VERIFIED: "E-mail não verificado",
};

const SOURCES: Record<string, string> = { seed: "Script de seed" };

const DETAIL_LABELS: Record<string, string> = {
  reason: "Motivo",
  email: "E-mail informado",
  sessionsRevoked: "Sessões encerradas",
  onlyOtherSessions: "Escopo",
  expiresInHours: "Validade do link",
  source: "Origem",
  name: "Nome",
  role: "Papel",
  passwordGenerated: "Senha inicial",
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "role" && isRole(value)) return ROLE_LABELS[value];
  if (key === "source" && typeof value === "string") return SOURCES[value] ?? value;
  if (key === "expiresInHours") return `${value} horas`;
  if (key === "passwordGenerated") return value ? "Gerada automaticamente" : "Definida pelo admin";
  if (key === "onlyOtherSessions") return value ? "Somente outras sessões do próprio admin" : "Todas";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function presentAuditRow(row: AuditLogRow, now: Date): AuditRow {
  const definition = getAuditActionDefinition(row.action);
  const metadata = { ...(row.metadata ?? {}) };

  const rawChanges = metadata.changes as AuditChanges | undefined;
  delete metadata.changes;
  const changes = rawChanges
    ? Object.entries(rawChanges).map(([field, change]) => ({
        field: AUDIT_FIELD_LABELS[field] ?? field,
        from: formatValue(field, change.from),
        to: formatValue(field, change.to),
      }))
    : [];

  const details = Object.entries(metadata).map(([key, value]) => ({
    label: DETAIL_LABELS[key] ?? key,
    value:
      key === "reason" && row.action === "auth.sign_in_failed" && typeof value === "string"
        ? (SIGN_IN_FAILURE_REASONS[value] ?? value)
        : formatValue(key, value),
  }));

  return {
    id: row.id,
    when: {
      relative: formatRelative(row.createdAt, now),
      absolute: formatDateTime(row.createdAt),
    },
    action: row.action,
    actionLabel: definition.label,
    category: definition.category,
    tone: definition.tone ?? "default",
    actor: row.actorId || row.actorEmail ? { name: row.actorName, email: row.actorEmail } : null,
    actorFallback: row.action === "auth.sign_in_failed" ? "Não autenticado" : "Sistema",
    entity:
      row.entityType && row.entityId
        ? {
            typeLabel:
              AUDIT_ENTITY_TYPES[row.entityType as keyof typeof AUDIT_ENTITY_TYPES] ?? row.entityType,
            label: row.entityLabel,
            href: `/auditoria?registro=${encodeURIComponent(`${row.entityType}:${row.entityId}`)}`,
          }
        : null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    changes,
    details,
  };
}
