import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { PORTAL_AUTH_BASE_PATH } from "@/lib/portal";

// Cliente do Better Auth do portal (pedir o código, entrar e sair). É outro
// cliente, com outra rota e outro cookie: não confunda com "@/lib/auth-client".
export const portalAuthClient = createAuthClient({
  basePath: PORTAL_AUTH_BASE_PATH,
  plugins: [emailOTPClient()],
});
