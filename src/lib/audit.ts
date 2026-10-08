// Catálogo das ações de auditoria. Compartilhado entre servidor e cliente
// (sem acesso a banco). Novas áreas do sistema (ex.: trabalhos) adicionam
// suas ações e categorias aqui.

export const AUDIT_CATEGORIES = {
  auth: "Autenticação",
  users: "Usuários",
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

type AuditActionDefinition = {
  label: string;
  category: AuditCategory;
  tone?: "warning" | "danger";
};

export const AUDIT_ACTIONS = {
  "auth.sign_in": { label: "Login", category: "auth" },
  "auth.sign_in_failed": { label: "Falha de login", category: "auth", tone: "warning" },
  "auth.sign_out": { label: "Logout", category: "auth" },
  "auth.password_reset": { label: "Senha redefinida pelo link", category: "auth" },
  "user.created": { label: "Usuário criado", category: "users" },
  "user.updated": { label: "Usuário editado", category: "users" },
  "user.password_set": { label: "Senha alterada pelo admin", category: "users" },
  "user.password_reset_sent": { label: "Link de redefinição enviado", category: "users" },
  "user.deactivated": { label: "Usuário desativado", category: "users", tone: "danger" },
  "user.activated": { label: "Usuário reativado", category: "users" },
  "user.sessions_revoked": { label: "Sessões encerradas", category: "users" },
  "user.deleted": { label: "Usuário excluído", category: "users", tone: "danger" },
} as const satisfies Record<string, AuditActionDefinition>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ENTITY_TYPES = {
  user: "Usuário",
} as const;
export type AuditEntityType = keyof typeof AUDIT_ENTITY_TYPES;

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && value in AUDIT_ACTIONS;
}

export function isAuditCategory(value: unknown): value is AuditCategory {
  return typeof value === "string" && value in AUDIT_CATEGORIES;
}

export function getAuditActionDefinition(action: string): AuditActionDefinition {
  return isAuditAction(action)
    ? AUDIT_ACTIONS[action]
    : { label: action, category: "auth" };
}

export function getActionsByCategory(category: AuditCategory): AuditAction[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter(
    (action) => AUDIT_ACTIONS[action].category === category,
  );
}

/** Rótulos dos campos que aparecem em metadata.changes. */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  role: "Papel",
};

/** Formato padrão de alterações: { campo: { from, to } }. */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;
