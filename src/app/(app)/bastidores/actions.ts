"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import type { UnlockedAchievement } from "@/lib/achievements";
import { getSession } from "@/lib/session";
import { guestbookSchema } from "@/lib/validations/achievements";
import { grantAchievements } from "@/server/achievements/core";
import { signGuestbook as sign } from "@/server/guestbook";

export type GuestbookResult =
  | { ok: true; unlocked: UnlockedAchievement[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/** Assina o livro de visitas: é a conquista "Você Não Deveria Estar Aqui" (o aviso aparece na hora). */
export async function signGuestbook(input: { message: string }): Promise<GuestbookResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const parsed = guestbookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revise o recado.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  await sign(db, { userId: session.user.id, message: parsed.data.message });
  const ids = await grantAchievements(db, session.user.id, ["voce-nao-deveria-estar-aqui"], { seen: true });
  const now = new Date().toISOString();
  refresh();
  return { ok: true, unlocked: ids.map((id) => ({ id, unlockedAt: now })) };
}
