import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { env } from "@/env";
import * as schema from "./schema";

export const db = drizzle({ client: neon(env.DATABASE_URL), schema });

/** Qualquer instância Drizzle/Postgres com o nosso schema (Neon, PGlite em testes...). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, typeof schema>;
