import "server-only";

import { after } from "next/server";

import { db } from "@/db";
import { env } from "@/env";
import { createPortalAuth } from "./portal-auth-config";

// O Better Auth do portal do cliente ligado ao banco e ao env. Para ler a
// sessão em páginas e actions do portal, use "@/lib/portal-session".
export const portalAuth = createPortalAuth({
  database: db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  runInBackground: (task) => after(task),
});
