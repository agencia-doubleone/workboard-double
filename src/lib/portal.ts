// Portal do cliente: constantes compartilhadas entre servidor, navegador e o
// proxy (sem banco). A autenticação fica em src/lib/portal-auth-config.ts.

/** Cookie próprio: a sessão do portal nunca vale como sessão da equipe, e vice-versa. */
export const PORTAL_COOKIE_PREFIX = "wb-portal";
export const PORTAL_AUTH_BASE_PATH = "/api/portal-auth";

export const PORTAL_HOME_PATH = "/portal";
export const PORTAL_SIGN_IN_PATH = "/portal/entrar";
export const PORTAL_PROFILE_PATH = "/portal/perfil";
export const PORTAL_REQUESTS_PATH = "/portal/solicitacoes";
export const PORTAL_NEW_REQUEST_PATH = "/portal/solicitacoes/nova";
export const PORTAL_PLANNING_PATH = "/portal/planejamento";

/** Código de entrada por e-mail. */
export const PORTAL_CODE_LENGTH = 6;
export const PORTAL_CODE_EXPIRES_MINUTES = 10;
/** Tentativas erradas antes de precisar pedir outro código. */
export const PORTAL_CODE_ATTEMPTS = 3;
/** Espera para reenviar o código. */
export const PORTAL_CODE_RESEND_SECONDS = 60;

/** Sessão longa (o cliente entra pouco), renovada com o uso. */
export const PORTAL_SESSION_DAYS = 30;

/** Situação de um contato, para a lista da página do cliente. */
export type PortalContactStatus = "active" | "pending" | "disabled";

export function portalContactStatus(contact: { disabledAt: Date | null; lastSignInAt: Date | null }): PortalContactStatus {
  if (contact.disabledAt) return "disabled";
  return contact.lastSignInAt ? "active" : "pending";
}

export const PORTAL_CONTACT_STATUS_LABELS: Record<PortalContactStatus, string> = {
  active: "Ativo",
  pending: "Ainda não entrou",
  disabled: "Desativado",
};
