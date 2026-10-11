"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-store";
import { isActivePath, NAV_SECTIONS } from "@/components/shell/nav-config";
import { saoPauloClock } from "@/lib/achievements";
import { checkInAchievements, claimAchievements, reportAchievement } from "./achievement-toasts";

// Conquistas no shell (montado no AppShell): mostra os avisos do que o servidor
// desbloqueou (na hora pelo tempo real; sem ele, ao voltar para a aba e de
// minuto em minuto), faz a checagem do dia e conta seções visitadas, visitas ao
// perfil e o código Konami no Início. Só a aba visível pede os avisos: a
// primeira que pedir marca como vistos.

const POLL_MS = 60_000;
const CHECK_IN_KEY = "wb:conquistas:dia";
const NAV_KEY = "wb:conquistas:secoes";
const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

const NAV_ITEMS = [...NAV_SECTIONS.main.items, ...NAV_SECTIONS.admin.items];

function isVisible() {
  return document.visibilityState === "visible";
}

/** Uma checagem por dia em cada aba (o servidor ignora o que a pessoa já tem). */
function checkInOncePerDay() {
  const today = saoPauloClock(new Date()).day;
  try {
    if (sessionStorage.getItem(CHECK_IN_KEY) === today) return;
    sessionStorage.setItem(CHECK_IN_KEY, today);
  } catch {
    // Sem storage: checa a cada abertura (é barato).
  }
  void checkInAchievements();
}

export function AchievementTracker() {
  const status = useRealtime((state) => state.status);

  useRealtimeEvent((event) => {
    if (event.type === "achievement.unlocked" && isVisible()) void claimAchievements();
  });

  useEffect(() => {
    if (isVisible()) {
      checkInOncePerDay();
      void claimAchievements();
    }
    function handleVisibility() {
      if (!isVisible()) return;
      checkInOncePerDay();
      void claimAchievements();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Sem tempo real, o aviso chega de minuto em minuto.
  useEffect(() => {
    if (status === "open") return;
    const timer = window.setInterval(() => {
      if (isVisible()) void claimAchievements();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [status]);

  return (
    // O caminho só existe no request em rotas com parâmetro: fica numa folha em Suspense.
    <Suspense fallback={null}>
      <RouteTracker />
    </Suspense>
  );
}

function RouteTracker() {
  const pathname = usePathname();

  // Seções visitadas (Explorador): uma vez por aba; o servidor ignora as que a pessoa não vê.
  useEffect(() => {
    const item = NAV_ITEMS.find((candidate) => isActivePath(pathname, candidate.href));
    if (!item) return;
    try {
      const seen = new Set<string>(JSON.parse(sessionStorage.getItem(NAV_KEY) ?? "[]"));
      if (seen.has(item.href)) return;
      seen.add(item.href);
      sessionStorage.setItem(NAV_KEY, JSON.stringify([...seen]));
    } catch {
      // Sem storage: avisa de novo (o servidor conta uma vez só).
    }
    reportAchievement({ type: "nav", href: item.href });
  }, [pathname]);

  // Quem É Esse Pokémon?: cada vez que abre o próprio perfil.
  useEffect(() => {
    if (pathname === "/perfil") reportAchievement({ type: "profile.visit" });
  }, [pathname]);

  return pathname === "/" ? <KonamiListener /> : null;
}

/** ↑ ↑ ↓ ↓ ← → ← → B A, no Início (fora de campos de texto). */
function KonamiListener() {
  // As últimas teclas (do tamanho do código): "↑ ↑ ↑ ↓ ↓..." também vale.
  const keys = useRef<string[]>([]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-KONAMI.length);
      if (keys.current.join() === KONAMI.join()) {
        keys.current = [];
        reportAchievement({ type: "konami" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  return null;
}
