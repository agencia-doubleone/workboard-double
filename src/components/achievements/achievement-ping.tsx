"use client";

import { useEffect, useRef } from "react";

import type { AchievementEvent } from "@/lib/achievements";
import { reportAchievement } from "./achievement-toasts";

/** Avisa um evento de conquista uma vez ao aparecer na tela (ex.: abrir um trabalho antigo). */
export function AchievementPing({ event }: { event: AchievementEvent }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    reportAchievement(event);
  }, [event]);
  return null;
}
