// Constantes de usuários compartilhadas entre servidor e cliente.

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: "Membro",
  admin: "Administrador",
};

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Validade do link de redefinição de senha enviado pelo admin. */
export const PASSWORD_RESET_EXPIRES_IN_HOURS = 24;
