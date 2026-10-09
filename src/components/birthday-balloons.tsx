"use client";

import { useEffect, useState } from "react";

// Balões que sobem pela tela no aniversário (como no X/Twitter). Visual em
// .birthday-balloon* no globals.css. Não bloqueia cliques e some sozinho.

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"];
const COUNT = 18;
const SEEN_KEY = "wb:birthday-balloons";

type Balloon = {
  id: number;
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  sway: number;
  swayDuration: number;
};

function launch(): Balloon[] {
  return Array.from({ length: COUNT }, (_, id) => ({
    id,
    left: Math.random() * 92,
    size: 34 + Math.random() * 30,
    color: COLORS[id % COLORS.length],
    delay: Math.random() * 2.5,
    duration: 6 + Math.random() * 3,
    sway: 8 + Math.random() * 18,
    swayDuration: 2.2 + Math.random() * 1.6,
  }));
}

/**
 * Solta os balões ao montar. Com `oncePerDay`, só na primeira vez do dia neste
 * navegador; remonte com outra `key` para soltar de novo.
 */
export function BirthdayBalloons({ oncePerDay = false }: { oncePerDay?: boolean }) {
  const [balloons, setBalloons] = useState<Balloon[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (oncePerDay) {
      const today = new Date().toDateString();
      try {
        if (localStorage.getItem(SEEN_KEY) === today) return;
        localStorage.setItem(SEEN_KEY, today);
      } catch {
        // Sem localStorage (aba anônima bloqueada): solta mesmo assim.
      }
    }
    const frame = requestAnimationFrame(() => setBalloons(launch()));
    const timer = window.setTimeout(() => setBalloons([]), 12_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [oncePerDay]);

  if (balloons.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {balloons.map((balloon) => (
        <div
          key={balloon.id}
          className="birthday-balloon"
          style={
            {
              left: `${balloon.left}%`,
              animationDuration: `${balloon.duration}s`,
              animationDelay: `${balloon.delay}s`,
              "--sway": `${balloon.sway}px`,
            } as React.CSSProperties
          }
        >
          <div className="birthday-balloon-sway" style={{ animationDuration: `${balloon.swayDuration}s` }}>
            <svg width={balloon.size} height={balloon.size * 1.9} viewBox="0 0 40 76" fill="none">
              <path
                d="M20 0C31 0 40 9.4 40 21.5 40 34.6 30.4 46 20 48 9.6 46 0 34.6 0 21.5 0 9.4 9 0 20 0Z"
                fill={balloon.color}
              />
              <ellipse cx="12.5" cy="14" rx="4" ry="7.5" fill="#fff" opacity="0.35" transform="rotate(-24 12.5 14)" />
              <path d="M16.5 49.5h7L20 53.5z" fill={balloon.color} />
              <path d="M20 53.5c-4 5.5 4 11-0.5 22.5" stroke="#9ca3af" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}
