"use client";

import { TrophyIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { launchConfetti } from "@/components/celebration";
import { getPreferences } from "@/components/preferences/preferences-store";
import { playNotificationSound } from "@/components/realtime/notification-sound";
import {
  ACHIEVEMENT_RARITIES,
  achievementOf,
  isAchievementId,
  type AchievementEvent,
  type AchievementId,
  type UnlockedAchievement,
} from "@/lib/achievements";
import type { AchievementRequest } from "@/lib/validations/achievements";
import { cn } from "@/lib/utils";
import { AchievementBadge, RARITY_TEXT } from "./achievement-badge";

// O lado do navegador: avisar eventos à rota /api/conquistas e mostrar o aviso
// "Conquista desbloqueada" (no canto, como nos videogames) com o som dos avisos.
// Lendária ganha confetes (se a comemoração estiver ligada).

/** Avisos de uma vez; o resto vira "+N conquistas". */
const VISIBLE_AT_ONCE = 3;
const TOAST_MS = 7_000;

async function send(body: AchievementRequest): Promise<UnlockedAchievement[]> {
  try {
    const response = await fetch("/api/conquistas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Continua mesmo se a página trocar logo depois (ex.: clicar num resultado da busca).
      keepalive: true,
    });
    if (!response.ok) return [];
    const data: { unlocked?: UnlockedAchievement[] } = await response.json();
    return (data.unlocked ?? []).filter((item) => isAchievementId(item.id));
  } catch {
    return [];
  }
}

/** Avisa um evento (tema, atalho, segredo...) e mostra o que ele desbloqueou. Nunca falha. */
export function reportAchievement(event: AchievementEvent) {
  void send({ action: "event", event }).then(showAchievementToasts);
}

/** Avisos das conquistas desbloqueadas pelo servidor que esta pessoa ainda não viu. */
export async function claimAchievements() {
  showAchievementToasts(await send({ action: "claim" }));
}

/** Checagem do dia: entrar pela primeira vez, datas especiais e tempo de casa. */
export async function checkInAchievements() {
  showAchievementToasts(await send({ action: "check-in" }));
}

export function showAchievementToasts(unlocked: UnlockedAchievement[]) {
  if (unlocked.length === 0) return;
  void playNotificationSound("unlock");
  const legendary = unlocked.some((item) => achievementOf(item.id).rarity === "legendary");
  if (legendary && getPreferences().celebrate) launchConfetti();
  // O mais novo fica na frente da pilha: o "+N" sai primeiro para uma conquista ficar à vista.
  const rest = unlocked.length - VISIBLE_AT_ONCE;
  if (rest > 0) {
    toast.custom((toastId) => <MoreToast count={rest} onClose={() => toast.dismiss(toastId)} />, { duration: TOAST_MS });
  }
  for (const item of unlocked.slice(0, VISIBLE_AT_ONCE).reverse()) {
    toast.custom((toastId) => <AchievementToast id={item.id} onClose={() => toast.dismiss(toastId)} />, {
      duration: TOAST_MS,
    });
  }
}

const cardClass =
  "flex w-[356px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border bg-popover p-3 pr-4 text-popover-foreground shadow-overlay outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50";

function AchievementToast({ id, onClose }: { id: AchievementId; onClose: () => void }) {
  const definition = achievementOf(id);
  return (
    <Link href={`/conquistas#${id}`} onClick={onClose} className={cardClass}>
      <AchievementBadge id={id} size={52} />
      <span className="grid min-w-0 gap-0.5">
        <span className="text-xs text-muted-foreground">
          Conquista desbloqueada ·{" "}
          <span className={cn("font-medium", RARITY_TEXT[definition.rarity])}>
            {ACHIEVEMENT_RARITIES[definition.rarity].label}
          </span>
        </span>
        <span className="truncate text-sm font-semibold">{definition.name}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{definition.description}</span>
      </span>
    </Link>
  );
}

function MoreToast({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <Link href="/conquistas" onClick={onClose} className={cardClass}>
      <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
        <TrophyIcon className="size-6" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-semibold">
          {count === 1 ? "Mais 1 conquista desbloqueada" : `Mais ${count} conquistas desbloqueadas`}
        </span>
        <span className="text-xs text-muted-foreground">Ver todas as suas conquistas</span>
      </span>
    </Link>
  );
}
