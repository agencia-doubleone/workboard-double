import { createAuthClient } from "better-auth/react";

// Ações de admin não passam pelo cliente: usam Server Actions (ver
// src/app/(app)/usuarios/actions.ts), que validam e registram auditoria.
export const authClient = createAuthClient();
