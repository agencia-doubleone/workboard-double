"use client";

import { useEffect } from "react";

import type { Holiday } from "@/lib/greeting";
import { HOLIDAY_ANIMATIONS } from "./holiday-animations";

/**
 * Solta a animação da data especial ao montar. Com `oncePerDay`, só na primeira
 * vez do dia neste navegador; remonte com outra `key` para soltar de novo.
 */
export function HolidayEffect({ holiday, oncePerDay = false }: { holiday: Holiday; oncePerDay?: boolean }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stop: (() => void) | undefined;
    // Como nos balões: o dia só é marcado quando a animação sai de fato (o React
    // monta e desmonta uma vez a mais em dev, e isso não pode gastar o dia).
    const frame = requestAnimationFrame(() => {
      if (oncePerDay) {
        const key = `wb:holiday-${holiday}`;
        const today = new Date().toDateString();
        try {
          if (localStorage.getItem(key) === today) return;
          localStorage.setItem(key, today);
        } catch {
          // Sem localStorage: solta mesmo assim.
        }
      }
      stop = HOLIDAY_ANIMATIONS[holiday]();
    });
    return () => {
      cancelAnimationFrame(frame);
      stop?.();
    };
  }, [holiday, oncePerDay]);

  return null;
}
