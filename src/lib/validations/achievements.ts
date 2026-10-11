import { z } from "zod";

import { isAchievementId, type AchievementId } from "@/lib/achievements";

/** Eventos do navegador (src/lib/achievements.ts, AchievementEvent). */
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("theme.dark") }),
  z.object({ type: z.literal("accent"), accent: z.string().max(32) }),
  z.object({ type: z.literal("sound.off") }),
  z.object({ type: z.literal("celebrate.off") }),
  z.object({ type: z.literal("search.shortcut") }),
  z.object({ type: z.literal("search.result"), key: z.string().min(1).max(300) }),
  z.object({ type: z.literal("nav"), href: z.string().max(100) }),
  z.object({ type: z.literal("profile.visit") }),
  z.object({ type: z.literal("konami") }),
  z.object({ type: z.literal("logo") }),
  z.object({ type: z.literal("door") }),
  z.object({ type: z.literal("rainbow") }),
  z.object({ type: z.literal("board.crowd"), boardId: z.uuid() }),
  z.object({ type: z.literal("job.visit"), jobId: z.uuid() }),
]);

/** POST /api/conquistas: pedir os avisos não vistos, a checagem do dia ou um evento. */
export const achievementRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("check-in") }),
  z.object({ action: z.literal("event"), event: eventSchema }),
]);
export type AchievementRequest = z.infer<typeof achievementRequestSchema>;

/** Conceder ou retirar uma conquista manual (só admins). */
export const manualAchievementSchema = z.object({
  userId: z.string().min(1),
  achievementId: z.custom<AchievementId>(isAchievementId),
  granted: z.boolean(),
});

/** Assinatura do livro de visitas da página secreta. */
export const guestbookSchema = z.object({
  message: z
    .string()
    .trim()
    .max(140, "No máximo 140 caracteres.")
    .transform((value) => value || null),
});
