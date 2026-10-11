"use client";

import { getPreferences } from "@/components/preferences/preferences-store";
import { playAchievementSound } from "@/components/realtime/notification-sound";

// Comemoração de entrega concluída (trabalho concluído, mês do planejamento
// finalizado): confetes saindo dos cantos de baixo e um som de conquista. Só
// para quem concluiu (na própria tela), e pode ser desligada nas Configurações
// ("Comemorar entregas concluídas").
// Desenhado num <canvas> temporário: sem biblioteca, não bloqueia cliques e some sozinho.

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#facc15", "#14b8a6"];
const PER_SIDE = 90;
const GRAVITY = 0.32;
const DRAG = 0.985;
const DURATION_MS = 3_800;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  /** Faz o papel "virar" (achata e estica), dando a sensação de giro em 3D. */
  wobble: number;
  wobbleSpeed: number;
  round: boolean;
};

function burst(fromX: number, fromY: number, direction: 1 | -1, scale: number): Piece[] {
  return Array.from({ length: PER_SIDE }, () => {
    // Para cima e para dentro da tela, com um leque de ~35°.
    const angle = (-90 + direction * (20 + Math.random() * 35)) * (Math.PI / 180);
    const speed = (14 + Math.random() * 12) * scale;
    return {
      x: fromX,
      y: fromY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.08 + Math.random() * 0.12,
      round: Math.random() < 0.25,
    };
  });
}

/** Só os confetes (sem som e sem olhar a preferência): também usados pelo comando /confetti das mensagens. */
export function launchConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "70",
  });
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(ratio, ratio);

  // Telas menores pedem menos força (senão tudo passa do topo).
  const scale = Math.min(1, height / 900) + 0.15;
  const pieces = [...burst(0, height, 1, scale), ...burst(width, height, -1, scale)];
  const started = performance.now();

  function frame(now: number) {
    const elapsed = now - started;
    context!.clearRect(0, 0, width, height);
    // No último segundo, tudo vai sumindo.
    context!.globalAlpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 1_000));
    for (const piece of pieces) {
      piece.vx *= DRAG;
      piece.vy = piece.vy * DRAG + GRAVITY;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      piece.wobble += piece.wobbleSpeed;
      context!.save();
      context!.translate(piece.x, piece.y);
      context!.rotate(piece.rotation);
      context!.scale(1, Math.cos(piece.wobble));
      context!.fillStyle = piece.color;
      if (piece.round) {
        context!.beginPath();
        context!.arc(0, 0, piece.size / 2, 0, Math.PI * 2);
        context!.fill();
      } else {
        context!.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      }
      context!.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
  // Aba escondida no meio (o navegador pausa os quadros): sai do mesmo jeito.
  window.setTimeout(() => canvas.remove(), DURATION_MS + 1_000);
}

/** Entrega concluída por quem está na tela: confetes e som, se a pessoa não desligou. */
export function celebrate({ force = false }: { force?: boolean } = {}) {
  if (!force && !getPreferences().celebrate) return;
  playAchievementSound();
  launchConfetti();
}

/** O status mudou de um que não encerra para um que encerra (ex.: "Concluído"). */
export { isJobCompletion as isCompletion } from "@/lib/jobs";
