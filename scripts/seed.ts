import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { createAuditRecorder, userEntity } from "@/server/audit/recorder";

const ADMIN_EMAIL = "admin@doubleone.com.br";
const recordAudit = createAuditRecorder(db);

const seedEnvSchema = z.object({
  SEED_ADMIN_PASSWORD: z
    .string("Defina SEED_ADMIN_PASSWORD no .env.local.")
    .min(8, "SEED_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres."),
  SEED_ADMIN_NAME: z.string().min(1).default("Administrador"),
});

async function seedAdmin() {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }
  const { SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = parsed.data;

  const [existing] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);

  if (existing) {
    // Idempotente: não mexe na senha, só garante o papel de admin.
    if (existing.role !== "admin") {
      await db.update(user).set({ role: "admin" }).where(eq(user.id, existing.id));
      await recordAudit({
        action: "user.updated",
        actor: null,
        entity: userEntity({ id: existing.id, email: ADMIN_EMAIL }),
        metadata: { source: "seed", changes: { role: { from: existing.role, to: "admin" } } },
      });
      console.log(`✔ ${ADMIN_EMAIL} já existia e foi promovido a admin.`);
    } else {
      console.log(`✔ ${ADMIN_EMAIL} já existe, nada a fazer.`);
    }
    return;
  }

  const { user: created } = await auth.api.createUser({
    body: {
      email: ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      name: SEED_ADMIN_NAME,
      role: "admin",
      data: { emailVerified: true },
    },
  });

  await recordAudit({
    action: "user.created",
    actor: null,
    entity: userEntity(created),
    metadata: { source: "seed", name: SEED_ADMIN_NAME, role: "admin" },
  });

  console.log(`✔ Admin ${ADMIN_EMAIL} criado.`);
}

seedAdmin().catch((error: unknown) => {
  console.error("✖ Falha no seed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
