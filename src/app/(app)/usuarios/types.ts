import type { Role } from "@/lib/users";

/** Linha da tabela de usuários, já formatada no servidor. */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  banReason: string | null;
  activeSessions: number;
  createdAt: string;
  lastSignIn: { relative: string; absolute: string } | null;
};
