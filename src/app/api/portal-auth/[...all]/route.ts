import { toNextJsHandler } from "better-auth/next-js";

import { portalAuth } from "@/lib/portal-auth";

export const { GET, POST } = toNextJsHandler(portalAuth);
