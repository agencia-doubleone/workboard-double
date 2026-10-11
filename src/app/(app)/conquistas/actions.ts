"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { achievementOf } from "@/lib/achievements";
import { getSession } from "@/lib/session";
import { manualAchievementSchema } from "@/lib/validations/achievements";
import { isActiveUser } from "@/server/achievements/core";
import { grantManualAchievement, revokeManualAchievement } from "@/server/achievements/page";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { findUserNames } from "@/server/jobs";
import { publishRealtimeAfter } from "@/server/realtime";

// Conquistas concedidas à mão (ex.: Caçador de Bugs): só admins, com auditoria.
// Quem recebe vê o aviso na hora (tempo real) ou quando voltar ao Workboard.

export type ManualAchievementResult = { ok: true; message: string } | { ok: false; error: string };

export async function setManualAchievement(input: {
  userId: string;
  achievementId: string;
  granted: boolean;
}): Promise<ManualAchievementResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (session.user.role !== "admin") return { ok: false, error: "Só admins concedem esta conquista." };
  const parsed = manualAchievementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conquista inválida." };
  const { userId, achievementId, granted } = parsed.data;
  const definition = achievementOf(achievementId);
  if (!definition.manual) return { ok: false, error: "Essa conquista se desbloqueia sozinha." };
  if (!(await isActiveUser(db, userId))) return { ok: false, error: "Essa pessoa não está ativa no Workboard." };

  const admin = { id: session.user.id, name: session.user.name };
  const changed = granted
    ? await grantManualAchievement(db, { userId, achievementId, admin })
    : await revokeManualAchievement(db, { userId, achievementId });
  if (!changed) return { ok: true, message: granted ? "A pessoa já tinha essa conquista." : "A pessoa não tinha essa conquista." };

  const names = await findUserNames(db, [userId]);
  await recordAudit({
    action: granted ? "achievement.granted" : "achievement.revoked",
    actor: session.user,
    entity: { type: "user", id: userId, label: names.get(userId) ?? null },
    metadata: { achievement: definition.name },
    ...getRequestMeta(await headers()),
  });
  if (granted) publishRealtimeAfter([userId], { type: "achievement.unlocked" });
  refresh();
  return { ok: true, message: granted ? `"${definition.name}" concedida.` : `"${definition.name}" retirada.` };
}
