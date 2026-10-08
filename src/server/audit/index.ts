import "server-only";

import { db } from "@/db";
import { createAuditRecorder } from "./recorder";

export { getRequestMeta, userEntity, type AuditActor } from "./recorder";

export const recordAudit = createAuditRecorder(db);
