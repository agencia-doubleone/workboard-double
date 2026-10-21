// Catálogo das ações de auditoria. Compartilhado entre servidor e cliente
// (sem acesso a banco). Novas áreas do sistema (ex.: trabalhos) adicionam
// suas ações e categorias aqui.

export const AUDIT_CATEGORIES = {
  auth: "Autenticação",
  users: "Usuários",
  clients: "Clientes",
  portal: "Portal do cliente",
  requests: "Solicitações",
  jobs: "Trabalhos",
  planning: "Planejamentos",
  whiteboards: "Quadros",
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
  "auth.password_reset_requested": { label: "Link de nova senha pedido no login", category: "auth" },
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
  "portal_user.created": { label: "Acesso ao portal criado", category: "portal" },
  "portal_user.updated": { label: "Acesso ao portal editado", category: "portal" },
  "portal_user.invited": { label: "Convite do portal enviado", category: "portal" },
  "portal_user.disabled": { label: "Acesso ao portal desativado", category: "portal", tone: "warning" },
  "portal_user.enabled": { label: "Acesso ao portal reativado", category: "portal" },
  "portal_user.deleted": { label: "Acesso ao portal excluído", category: "portal", tone: "danger" },
  "portal.sign_in": { label: "Login no portal do cliente", category: "portal" },
  "portal.profile_updated": { label: "Perfil do portal atualizado", category: "portal" },
  "portal.photo_updated": { label: "Foto do portal atualizada", category: "portal" },
  "portal.photo_removed": { label: "Foto do portal removida", category: "portal" },
  "client_request.created": { label: "Solicitação aberta", category: "requests" },
  "client_request.status_changed": { label: "Status da solicitação alterado", category: "requests" },
  "client_request.updated": { label: "Solicitação editada", category: "requests" },
  "client_request.canceled": { label: "Solicitação cancelada pelo cliente", category: "requests", tone: "warning" },
  "client_request.message_deleted": { label: "Mensagem de solicitação excluída", category: "requests", tone: "warning" },
  "client_request.deleted": { label: "Solicitação excluída", category: "requests", tone: "danger" },
  "client_request.delivery_sent": { label: "Entrega enviada para aprovação", category: "requests" },
  "client_request.delivery_withdrawn": { label: "Entrega retirada", category: "requests", tone: "warning" },
  "client_request.delivery_answered": { label: "Entrega respondida pelo cliente", category: "requests" },
  "client_request.delivery_files_removed": {
    label: "Arquivos de rodadas anteriores excluídos",
    category: "requests",
    tone: "warning",
  },
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
  "planning.created": { label: "Planejamento criado", category: "planning" },
  "planning.updated": { label: "Planejamento editado", category: "planning" },
  "planning.deleted": { label: "Planejamento excluído", category: "planning", tone: "danger" },
  "planning.month_status_changed": { label: "Status do mês do planejamento alterado", category: "planning" },
  "planning.imported": { label: "Posts importados do documento", category: "planning" },
  "planning.posts_deleted": { label: "Posts do planejamento excluídos", category: "planning", tone: "warning" },
  "planning.brief_approved": { label: "Pauta aprovada pela equipe em nome do cliente", category: "planning" },
  "planning.brief_approval_undone": { label: "Aprovação da pauta desfeita", category: "planning", tone: "warning" },
  "planning.decision_registered": { label: "Resposta do cliente registrada pela equipe", category: "planning" },
  "planning.sent": { label: "Planejamento enviado ao cliente para aprovar", category: "planning" },
  "planning.send_withdrawn": { label: "Envio ao cliente retirado", category: "planning", tone: "warning" },
  "planning.answered": { label: "Cliente respondeu o planejamento", category: "planning" },
  "whiteboard.created": { label: "Quadro criado", category: "whiteboards" },
  "whiteboard.updated": { label: "Quadro editado", category: "whiteboards" },
  "whiteboard.deleted": { label: "Quadro excluído", category: "whiteboards", tone: "danger" },
  "achievement.granted": { label: "Conquista concedida", category: "users" },
  "achievement.revoked": { label: "Conquista retirada", category: "users", tone: "warning" },
  "media.uploaded": { label: "Arquivo enviado", category: "media" },
  "media.deleted": { label: "Arquivo excluído", category: "media", tone: "danger" },
} as const satisfies Record<string, AuditActionDefinition>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ENTITY_TYPES = {
  user: "Usuário",
  client: "Cliente",
  job: "Trabalho",
  job_status: "Status de trabalho",
  planning: "Planejamento",
  whiteboard: "Quadro",
  media: "Arquivo",
  client_request: "Solicitação",
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
  foundedOn: "Fundação",
  dates: "Datas importantes",
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
  isCanceled: "Cancela o trabalho",
  networks: "Redes",
  postsPerMonth: "Posts por mês",
  approvesBrief: "Aprovar pauta",
  members: "Responsáveis",
  overview: "Informações gerais",
  title: "Título",
  access: "Acesso",
  job: "Trabalho",
  whiteboardMembers: "Pessoas",
  expectedOn: "Previsão de entrega",
  canApprove: "Pode aprovar entregas",
};

/** Formato padrão de alterações: { campo: { from, to } }. */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;
