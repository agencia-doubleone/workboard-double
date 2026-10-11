"use client";

import { useEffect, useRef } from "react";

import { launchConfetti } from "@/components/celebration";
import type { MessageEffect } from "@/lib/messages";

// Efeitos dos comandos das mensagens (/confetti, /flip, /coffee, /party e o secreto /matrix), na
// tela de quem está com a conversa aberta. Elementos temporários animados com a
// Web Animations API: sem biblioteca, não bloqueiam cliques e somem sozinhos.
// Com prefers-reduced-motion, nada se mexe (fica só a linha na conversa).

/** Só toca o efeito de mensagem que chegou há pouco: abrir a conversa depois não repete a festa. */
const LIVE_WINDOW_MS = 60_000;

/** Camada por cima de tudo, removida depois de `duration`. */
function overlay(duration: number) {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "70", overflow: "hidden" });
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), duration);
  return layer;
}

function emoji(char: string, size: number) {
  const span = document.createElement("span");
  span.textContent = char;
  Object.assign(span.style, { position: "absolute", fontSize: `${size}px`, lineHeight: "1", willChange: "transform, opacity" });
  return span;
}

/** /flip: a conversa dá uma volta inteira. */
function flip(target: HTMLElement | null) {
  target?.animate(
    [
      { transform: "perspective(1400px) rotateY(0deg)" },
      { transform: "perspective(1400px) rotateY(180deg) scale(0.92)", offset: 0.5 },
      { transform: "perspective(1400px) rotateY(360deg)" },
    ],
    { duration: 1_100, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
  );
}

/** /coffee: uma xícara aparece no meio da tela, com vapor subindo. */
function coffee() {
  const layer = overlay(3_400);
  const cup = emoji("☕", 112);
  Object.assign(cup.style, { left: "50%", bottom: "22%", marginLeft: "-56px" });
  layer.appendChild(cup);
  cup.animate(
    [
      { transform: "translateY(60px) scale(0.4)", opacity: 0 },
      { transform: "translateY(0) scale(1.08)", opacity: 1, offset: 0.16 },
      { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.24 },
      { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.85 },
      { transform: "translateY(-24px) scale(0.9)", opacity: 0 },
    ],
    { duration: 3_200, easing: "ease-out", fill: "forwards" },
  );
  [-24, 0, 24].forEach((offset, index) => {
    const steam = document.createElement("span");
    Object.assign(steam.style, {
      position: "absolute",
      left: `calc(50% + ${offset}px)`,
      bottom: "calc(22% + 108px)",
      width: "8px",
      height: "44px",
      marginLeft: "-4px",
      borderRadius: "9999px",
      background: "rgb(148 163 184 / 0.75)",
      opacity: "0",
    });
    layer.appendChild(steam);
    steam.animate(
      [
        { transform: "translate(0, 12px) scaleY(0.6)", opacity: 0 },
        { transform: "translate(-6px, -20px) scaleY(1)", opacity: 0.85, offset: 0.4 },
        { transform: "translate(6px, -64px) scaleY(1.2)", opacity: 0 },
      ],
      { duration: 1_300, delay: 450 + index * 220, iterations: 2, easing: "ease-out" },
    );
  });
}

const PARTY = ["🎉", "🎊", "🥳", "🎈", "🪩", "✨"];

/** /party: chuva de emojis de festa e confetes. */
function party() {
  const layer = overlay(5_000);
  const height = window.innerHeight;
  for (let index = 0; index < 42; index++) {
    const piece = emoji(PARTY[index % PARTY.length], 22 + Math.random() * 22);
    Object.assign(piece.style, { left: `${Math.random() * 100}%`, top: "-60px" });
    layer.appendChild(piece);
    const drift = (Math.random() - 0.5) * 160;
    const spin = (Math.random() - 0.5) * 720;
    piece.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)" },
        { transform: `translate(${drift}px, ${height + 120}px) rotate(${spin}deg)` },
      ],
      { duration: 2_400 + Math.random() * 1_600, delay: Math.random() * 900, easing: "cubic-bezier(0.3, 0, 0.7, 1)", fill: "both" },
    );
  }
  launchConfetti();
}

const MATRIX_GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789WORKBOARD";
const MATRIX_MS = 4_200;

/** /matrix (secreto): chuva de letras verdes num fundo escuro que some sozinho. */
function matrix() {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "70" });
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(ratio, ratio);
  const size = 16;
  const drops = Array.from({ length: Math.ceil(width / size) }, () => -Math.random() * (height / size));
  const started = performance.now();
  let last = started;

  function frame(now: number) {
    const elapsed = now - started;
    // ~20 quadros por segundo: o rastro fica com a cara do filme.
    if (now - last >= 50) {
      last = now;
      context!.fillStyle = "rgba(0, 0, 0, 0.12)";
      context!.fillRect(0, 0, width, height);
      context!.font = `${size}px monospace`;
      for (let column = 0; column < drops.length; column++) {
        const glyph = MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)];
        context!.fillStyle = Math.random() < 0.08 ? "#d1fae5" : "#22c55e";
        context!.fillText(glyph, column * size, drops[column] * size);
        drops[column] = drops[column] * size > height && Math.random() > 0.96 ? 0 : drops[column] + 1;
      }
    }
    // No último segundo, a tela volta ao normal.
    canvas.style.opacity = String(Math.max(0, Math.min(1, (MATRIX_MS - elapsed) / 1_000)));
    if (elapsed < MATRIX_MS) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
  window.setTimeout(() => canvas.remove(), MATRIX_MS + 1_000);
}

/** Toca o efeito. `target` é a área da conversa (o /flip gira ela). */
export function playMessageEffect(effect: MessageEffect, target?: HTMLElement | null) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  switch (effect) {
    case "confetti":
      launchConfetti();
      break;
    case "flip":
      flip(target ?? null);
      break;
    case "coffee":
      coffee();
      break;
    case "party":
      party();
      break;
    case "matrix":
      matrix();
      break;
  }
}

/**
 * Toca o efeito das mensagens que aparecem com a conversa aberta (as que já
 * estavam ao abrir, ou as antigas de "Carregar anteriores", não tocam).
 */
export function useLiveMessageEffects(
  messages: { id: string; effect: MessageEffect | null; createdAt: string }[],
  target: React.RefObject<HTMLElement | null>,
) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(messages.map((message) => message.id));
      return;
    }
    const known = seen.current;
    const fresh = messages.filter((message) => !known.has(message.id));
    for (const message of fresh) known.add(message.id);
    const now = Date.now();
    const live = fresh.findLast((message) => message.effect && now - Date.parse(message.createdAt) < LIVE_WINDOW_MS);
    if (live?.effect) playMessageEffect(live.effect, target.current);
  }, [messages, target]);
}
