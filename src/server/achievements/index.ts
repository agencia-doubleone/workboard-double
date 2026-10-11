import "server-only";

import { after } from "next/server";

import { db, type Database } from "@/db";
import { publishRealtime } from "@/server/realtime";
import type { UnlockMap } from "./core";

// Ponte das actions com as regras: roda depois da resposta (after), nunca lança
// erro (a ação principal já deu certo) e avisa em tempo real quem desbloqueou
// algo; a tela dessa pessoa pede os avisos (claimUnseenAchievements). Sem tempo
// real, os avisos aparecem quando ela voltar à aba ou trocar de página.

export function achievementsAfter(label: string, task: (database: Database) => Promise<UnlockMap>) {
  after(async () => {
    try {
      const unlocks = await task(db);
      const userIds = [...unlocks].filter(([, ids]) => ids.length > 0).map(([userId]) => userId);
      if (userIds.length > 0) await publishRealtime(userIds, { type: "achievement.unlocked" });
    } catch (error) {
      console.error(`[conquistas] ${label}`, error);
    }
  });
}

export * from "./triggers";
