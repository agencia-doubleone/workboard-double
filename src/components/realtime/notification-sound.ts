"use client";

import { getPreferences } from "@/components/preferences/preferences-store";

// Som dos avisos, sintetizado com Web Audio (sem arquivo para baixar). É o único
// som: a notificação do sistema sai muda, para não tocar duas vezes. Com várias
// abas abertas, toca uma vez só (a primeira aba que pegar a trava toca).
//
// O navegador só libera áudio numa aba depois de alguma interação nela (clique
// ou tecla); abas que nunca foram tocadas ficam de fora da disputa.

export type SoundKind = "message" | "notification" | "unlock";

type Note = { frequency: number; start: number; duration: number };

const SOUNDS: Record<SoundKind | "achievement", Note[]> = {
  // Chat: duas notas curtas, subindo.
  message: [
    { frequency: 784, start: 0, duration: 0.09 },
    { frequency: 1047, start: 0.08, duration: 0.16 },
  ],
  // Notificação de trabalho: um "plim" mais aberto.
  notification: [
    { frequency: 1047, start: 0, duration: 0.18 },
    { frequency: 1319, start: 0.12, duration: 0.3 },
  ],
  // Conquista desbloqueada: três notas rápidas e brilhantes, como nos videogames.
  unlock: [
    { frequency: 988, start: 0, duration: 0.1 },
    { frequency: 1319, start: 0.08, duration: 0.1 },
    { frequency: 1976, start: 0.16, duration: 0.42 },
  ],
  // Trabalho concluído: arpejo subindo, com a última nota mais longa ("conquista").
  achievement: [
    { frequency: 784, start: 0, duration: 0.14 },
    { frequency: 1047, start: 0.09, duration: 0.14 },
    { frequency: 1319, start: 0.18, duration: 0.14 },
    { frequency: 1568, start: 0.27, duration: 0.6 },
    { frequency: 2093, start: 0.27, duration: 0.45 },
  ],
};

/** Onda de cada som: a conquista usa uma mais brilhante. */
const WAVES: Record<keyof typeof SOUNDS, OscillatorType> = {
  message: "sine",
  notification: "sine",
  unlock: "triangle",
  achievement: "triangle",
};

const VOLUME = 0.12;
const SOUND_LOCK = "workboard:som";
/** Eventos que chegam juntos (várias abas, notificação + mensagem) tocam uma vez só. */
const QUIET_AFTER_MS = 1_200;

let context: AudioContext | null = null;

function canPlay() {
  // Sem interação na aba, o navegador não deixa o áudio começar.
  return typeof window !== "undefined" && (navigator.userActivation?.hasBeenActive ?? true);
}

function getContext() {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function synthesize(kind: keyof typeof SOUNDS) {
  const audio = getContext();
  const now = audio.currentTime + 0.01;
  for (const note of SOUNDS[kind]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = WAVES[kind];
    oscillator.frequency.value = note.frequency;
    const start = now + note.start;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.05);
  }
}

/** Libera o áudio no primeiro clique ou tecla desta aba. Devolve a limpeza. */
export function startSoundUnlock() {
  function unlock() {
    getContext();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  }
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/** Toca o som do aviso, se a pessoa não desligou nas Configurações. */
export async function playNotificationSound(kind: SoundKind) {
  if (!getPreferences().sound || !canPlay()) return;
  try {
    if (!("locks" in navigator)) return synthesize(kind);
    await navigator.locks.request(SOUND_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      synthesize(kind);
      await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS));
    });
  } catch {
    // Áudio indisponível (ex.: navegador sem Web Audio): fica só o aviso visual.
  }
}

/** Som de conquista (trabalho concluído). Quem decide se toca é a preferência de comemoração. */
export function playAchievementSound() {
  if (!canPlay()) return;
  try {
    synthesize("achievement");
  } catch {
    // Sem Web Audio.
  }
}

/** Amostra ao ligar o som nas Configurações (vem de um clique, então sempre pode tocar). */
export function previewNotificationSound() {
  try {
    synthesize("notification");
  } catch {
    // Sem Web Audio.
  }
}
