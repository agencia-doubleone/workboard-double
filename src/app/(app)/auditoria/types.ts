import type { AuditCategory } from "@/lib/audit";

/** Evento de auditoria já formatado no servidor para exibição. */
export type AuditRow = {
  id: string;
  when: { relative: string; absolute: string };
  action: string;
  actionLabel: string;
  category: AuditCategory;
  tone: "default" | "warning" | "danger";
  actor: { name: string | null; email: string | null } | null;
  /** Rótulo quando não há ator: "Sistema" ou "Não autenticado". */
  actorFallback: string;
  entity: { typeLabel: string; label: string | null; href: string | null } | null;
  ipAddress: string | null;
  userAgent: string | null;
  changes: { field: string; from: string; to: string }[];
  details: { label: string; value: string }[];
};
