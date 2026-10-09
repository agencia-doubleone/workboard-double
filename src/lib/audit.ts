// Catálogo das ações de auditoria. Compartilhado entre servidor e cliente
// (sem acesso a banco). Novas áreas do sistema (ex.: trabalhos) adicionam
// suas ações e categorias aqui.

export const AUDIT_CATEGORIES = {
  auth: "Autenticação",
  users: "Usuários",
  clients: "Clientes",
  jobs: "Trabalhos",
  media: "Arquivos",
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
  "auth.password_changed": { label: "Senha alterada pelo usuário", category: "auth" },
  "user.created": { label: "Usuário criado", category: "users" },
  "user.updated": { label: "Usuário editado", category: "users" },
  "user.password_set": { label: "Senha alterada pelo admin", category: "users" },
  "user.password_reset_sent": { label: "Link de redefinição enviado", category: "users" },
  "user.deactivated": { label: "Usuário desativado", category: "users", tone: "danger" },
  "user.activated": { label: "Usuário reativado", category: "users" },
  "user.sessions_revoked": { label: "Sessões encerradas", category: "users" },
  "user.deleted": { label: "Usuário excluído", category: "users", tone: "danger" },
  "profile.updated": { label: "Perfil editado", category: "users" },
  "profile.photo_updated": { label: "Foto de perfil alterada", category: "users" },
  "profile.photo_removed": { label: "Foto de perfil removida", category: "users" },
  "client.created": { label: "Cliente cadastrado", category: "clients" },
  "client.updated": { label: "Cliente editado", category: "clients" },
  "client.archived": { label: "Cliente arquivado", category: "clients", tone: "warning" },
  "client.restored": { label: "Cliente reativado", category: "clients" },
  "client.credential_created": { label: "Acesso adicionado ao cofre", category: "clients" },
  "client.credential_updated": { label: "Acesso do cofre editado", category: "clients" },
  "client.credential_deleted": { label: "Acesso do cofre excluído", category: "clients", tone: "danger" },
  "client.credential_viewed": { label: "Senha do cofre revelada", category: "clients", tone: "warning" },
  "client.credential_copied": { label: "Senha do cofre copiada", category: "clients", tone: "warning" },
  "job.created": { label: "Trabalho cadastrado", category: "jobs" },
  "job.updated": { label: "Trabalho editado", category: "jobs" },
  "job.status_changed": { label: "Status do trabalho alterado", category: "jobs" },
  "job.activated": { label: "Trabalho ativado", category: "jobs" },
  "job.deactivated": { label: "Trabalho desativado", category: "jobs", tone: "warning" },
  "job.deleted": { label: "Trabalho excluído", category: "jobs", tone: "danger" },
  "job.message_deleted": { label: "Mensagem excluída", category: "jobs", tone: "warning" },
  "job_status.created": { label: "Status de trabalho criado", category: "jobs" },
  "job_status.updated": { label: "Status de trabalho editado", category: "jobs" },
  "job_status.deleted": { label: "Status de trabalho excluído", category: "jobs", tone: "danger" },
  "job_status.default_changed": { label: "Status padrão alterado", category: "jobs" },
  "job_status.reordered": { label: "Ordem dos status alterada", category: "jobs" },
  "media.uploaded": { label: "Arquivo enviado", category: "media" },
  "media.deleted": { label: "Arquivo excluído", category: "media", tone: "danger" },
} as const satisfies Record<string, AuditActionDefinition>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ENTITY_TYPES = {
  user: "Usuário",
  client: "Cliente",
  job: "Trabalho",
  job_status: "Status de trabalho",
  media: "Arquivo",
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
  birthday: "Aniversário",
  logo: "Logo",
  website: "Site",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  ageRange: "Faixa etária",
  genders: "Gênero",
  socialClasses: "Classe social",
  notes: "Informações gerais",
  service: "Serviço",
  url: "Endereço",
  username: "Login",
  password: "Senha",
  client: "Cliente",
  assignees: "Funcionários",
  dueDate: "Entrega",
  status: "Status",
  active: "Ativo",
  briefing: "Briefing",
  textColor: "Cor do texto",
  backgroundColor: "Cor do fundo",
  isFinal: "Encerra o trabalho",
};

/** Formato padrão de alterações: { campo: { from, to } }. */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;
