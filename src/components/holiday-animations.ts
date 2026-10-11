"use client";

import type { Holiday } from "@/lib/greeting";

// Animações das datas especiais (src/lib/greeting.ts): morcegos e fantasmas no
// Halloween, neve no Natal e fogos no Ano Novo. Como os balões de aniversário e
// os confetes: por cima de tudo, sem bloquear cliques, e somem sozinhas. Cada
// uma devolve a função que tira tudo da tela antes da hora.

const isDark = () => document.documentElement.classList.contains("dark");
const random = (min: number, max: number) => min + Math.random() * (max - min);

/** Camada por cima de tudo, removida depois de `duration` (ou ao chamar a limpeza). */
function overlay(duration: number) {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "60", overflow: "hidden" });
  document.body.appendChild(layer);
  const timer = window.setTimeout(() => layer.remove(), duration);
  return {
    layer,
    stop: () => {
      window.clearTimeout(timer);
      layer.remove();
    },
  };
}

/**
 * Elemento posicionado com um SVG fixo dentro (desenho nosso, sem dado de fora).
 * Começa invisível: até a animação começar (ou com a aba em segundo plano), não
 * aparece parado no canto da tela.
 */
function figure(markup: string, width: number, color: string) {
  const element = document.createElement("div");
  element.innerHTML = markup;
  Object.assign(element.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${width}px`,
    color,
    opacity: "0",
    willChange: "transform, opacity",
  });
  const svg = element.firstElementChild as SVGElement;
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "auto";
  return element;
}

// Halloween: morcegos atravessando a tela batendo as asas e fantasmas subindo.

const BAT =
  '<svg viewBox="0 0 100 40" fill="currentColor"><path d="M50 12c-2-3-5-3-6 1-5-6-17-10-40-4 10 4 14 10 13 18 5-5 11-5 14 0 3-5 9-4 11 2 2-3 4-3 5 0l3 4 3-4c1-3 3-3 5 0 2-6 8-7 11-2 3-5 9-5 14 0-1-8 3-14 13-18-23-6-35-2-40 4-1-4-4-4-6-1z"/><path d="M45 12l1-6 2 5zM55 12l-1-6-2 5z"/></svg>';

const GHOST =
  '<svg viewBox="0 0 40 50"><path d="M20 2C9 2 2 10 2 21v25l6-5 6 6 6-6 6 6 6-6 6 5V21C38 10 31 2 20 2z" fill="currentColor" stroke="#a8a29e" stroke-width="1.2" stroke-opacity="0.6"/><ellipse cx="14" cy="20" rx="3" ry="4.2" fill="#1c1917"/><ellipse cx="26" cy="20" rx="3" ry="4.2" fill="#1c1917"/><ellipse cx="20" cy="30" rx="3.2" ry="4" fill="#1c1917" opacity="0.85"/></svg>';

const HALLOWEEN_MS = 11_000;

export function launchHalloween() {
  const { layer, stop } = overlay(HALLOWEEN_MS);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const batColor = isDark() ? "#d6d3d1" : "#1c1917";

  for (let index = 0; index < 11; index++) {
    const size = random(36, 72);
    const fromLeft = index % 2 === 0;
    const startX = fromLeft ? -size - 20 : width + 20;
    const endX = fromLeft ? width + 20 : -size - 20;
    const startY = random(0.08, 0.6) * height;
    const drift = random(-140, 80);
    const bat = figure(BAT, size, batColor);
    layer.appendChild(bat);
    // Voo em ondas de um lado ao outro, subindo ou descendo um pouco.
    bat.animate(
      [0, 0.25, 0.5, 0.75, 1].map((step, point) => ({
        transform: `translate(${startX + (endX - startX) * step}px, ${startY + drift * step + (point % 2 ? -30 : 24)}px)`,
        opacity: 1,
      })),
      { duration: random(4_500, 7_500), delay: random(0, 3_000), easing: "ease-in-out", fill: "both" },
    );
    // As asas batem.
    (bat.firstElementChild as SVGElement).animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0.35)" }], {
      duration: random(140, 220),
      direction: "alternate",
      iterations: Infinity,
    });
  }

  for (let index = 0; index < 7; index++) {
    const size = random(34, 58);
    const ghost = figure(GHOST, size, isDark() ? "#f5f5f4" : "#ffffff");
    const x = random(0.04, 0.92) * width;
    const sway = random(18, 40);
    layer.appendChild(ghost);
    ghost.animate(
      [
        { transform: `translate(${x}px, ${height + 20}px)`, opacity: 0 },
        { transform: `translate(${x + sway}px, ${height * 0.7}px)`, opacity: 0.95, offset: 0.25 },
        { transform: `translate(${x - sway}px, ${height * 0.35}px)`, opacity: 0.9, offset: 0.6 },
        { transform: `translate(${x + sway / 2}px, -${size * 1.6}px)`, opacity: 0 },
      ],
      { duration: random(6_000, 8_500), delay: random(0, 2_500), easing: "ease-in-out", fill: "both" },
    );
  }
  return stop;
}

// Natal: neve caindo devagar, balançando (azul-claro no tema claro, branca no escuro).

const FLAKE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M12 5.5 9.8 3.3M12 5.5l2.2-2.2M12 18.5l-2.2 2.2M12 18.5l2.2 2.2"/></svg>';

const SNOW_MS = 16_000;

export function launchSnow() {
  const { layer, stop } = overlay(SNOW_MS);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const color = isDark() ? "#f8fafc" : "#93c5fd";

  for (let index = 0; index < 70; index++) {
    const isFlake = index % 3 === 0;
    const size = isFlake ? random(12, 24) : random(4, 9);
    let flake: HTMLElement;
    if (isFlake) {
      flake = figure(FLAKE, size, color);
    } else {
      flake = document.createElement("div");
      Object.assign(flake.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "9999px",
        background: color,
        opacity: "0",
        willChange: "transform, opacity",
      });
    }
    layer.appendChild(flake);
    const x = random(0, width);
    const sway = random(20, 60);
    const spin = isFlake ? random(-360, 360) : 0;
    const duration = random(7_000, 11_500);
    flake.animate(
      [
        { transform: `translate(${x}px, -30px) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${x + sway}px, ${height * 0.3}px) rotate(${spin * 0.3}deg)`, opacity: 0.95, offset: 0.3 },
        { transform: `translate(${x - sway}px, ${height * 0.7}px) rotate(${spin * 0.7}deg)`, opacity: 0.9, offset: 0.7 },
        { transform: `translate(${x}px, ${height + 30}px) rotate(${spin}deg)`, opacity: 0.4 },
      ],
      { duration, delay: random(0, SNOW_MS - duration - 500), easing: "linear", fill: "both" },
    );
  }
  return stop;
}

// Ano Novo: fogos de artifício num <canvas> (foguetes sobem e explodem em faíscas).

const FIREWORK_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6", "#facc15"];
const ROCKETS = 9;
const FIREWORKS_MS = 7_500;

type Rocket = { x: number; y: number; vy: number; targetY: number; color: string; launchAt: number; exploded: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };

export function launchFireworks() {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "60" });
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return () => {};
  }
  context.scale(ratio, ratio);

  // Faísca branca some no tema claro: lá ela vira dourada.
  const spark = isDark() ? "#ffffff" : "#f59e0b";
  const scale = Math.min(1.2, height / 800);
  const rockets: Rocket[] = Array.from({ length: ROCKETS }, (_, index) => ({
    x: random(0.12, 0.88) * width,
    y: height + 10,
    vy: -random(11, 14) * scale,
    targetY: random(0.14, 0.42) * height,
    color: FIREWORK_COLORS[index % FIREWORK_COLORS.length],
    launchAt: index * 520 + random(0, 300),
    exploded: false,
  }));
  const sparks: Spark[] = [];
  const started = performance.now();
  let frameId = 0;

  function explode(rocket: Rocket) {
    rocket.exploded = true;
    const count = 80;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + random(-0.05, 0.05);
      const speed = random(1.8, 5.2) * scale;
      sparks.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: random(55, 90),
        color: Math.random() < 0.18 ? spark : rocket.color,
        size: random(1.8, 3.2),
      });
    }
  }

  function frame(now: number) {
    const elapsed = now - started;
    context!.clearRect(0, 0, width, height);
    for (const rocket of rockets) {
      if (rocket.exploded || elapsed < rocket.launchAt) continue;
      const previousY = rocket.y;
      rocket.y += rocket.vy;
      rocket.vy += 0.12 * scale;
      // Rastro do foguete subindo.
      context!.strokeStyle = rocket.color;
      context!.globalAlpha = 0.9;
      context!.lineWidth = 2;
      context!.beginPath();
      context!.moveTo(rocket.x, previousY + 10);
      context!.lineTo(rocket.x, rocket.y);
      context!.stroke();
      if (rocket.y <= rocket.targetY || rocket.vy >= -1) explode(rocket);
    }
    for (const item of sparks) {
      if (item.life >= item.maxLife) continue;
      item.life++;
      item.vx *= 0.975;
      item.vy = item.vy * 0.975 + 0.045;
      item.x += item.vx;
      item.y += item.vy;
      context!.globalAlpha = Math.max(0, 1 - item.life / item.maxLife);
      context!.fillStyle = item.color;
      context!.beginPath();
      context!.arc(item.x, item.y, item.size, 0, Math.PI * 2);
      context!.fill();
    }
    context!.globalAlpha = 1;
    const done = rockets.every((rocket) => rocket.exploded) && sparks.every((item) => item.life >= item.maxLife);
    if (done || elapsed > FIREWORKS_MS) canvas.remove();
    else frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  // Aba escondida no meio (o navegador pausa os quadros): sai do mesmo jeito.
  const timer = window.setTimeout(() => canvas.remove(), FIREWORKS_MS + 1_000);
  return () => {
    cancelAnimationFrame(frameId);
    window.clearTimeout(timer);
    canvas.remove();
  };
}

export const HOLIDAY_ANIMATIONS: Record<Holiday, () => () => void> = {
  halloween: launchHalloween,
  christmas: launchSnow,
  "new-year": launchFireworks,
};
