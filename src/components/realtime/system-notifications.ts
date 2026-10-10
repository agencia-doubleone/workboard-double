"use client";

import { useSyncExternalStore } from "react";

// Notificações do sistema (Windows/macOS) enquanto o Workboard está aberto em
// alguma aba. Com várias abas, só uma (a "líder", pela Web Locks API) mostra a
// notificação, e só quando ninguém está olhando para o Workboard: cada aba
// visível e com foco segura uma trava "atenção", que a líder consulta.

const LEADER_LOCK = "workboard:notificador";
const ATTENTION_PREFIX = "workboard:atencao:";

let isLeader = false;

function hasLocks() {
  return typeof navigator !== "undefined" && "locks" in navigator;
}

function isAttending() {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Liga a liderança e a trava de atenção desta aba. Devolve a limpeza. */
export function startAttentionTracking() {
  if (!hasLocks()) {
    isLeader = true;
    return () => {};
  }
  const tabLock = ATTENTION_PREFIX + crypto.randomUUID();
  let stopped = false;
  let releaseLeader: (() => void) | null = null;
  let releaseAttention: (() => void) | null = null;
  let requesting = false;

  void navigator.locks.request(
    LEADER_LOCK,
    () =>
      new Promise<void>((resolve) => {
        if (stopped) return resolve();
        isLeader = true;
        releaseLeader = resolve;
      }),
  );

  function update() {
    if (stopped) return;
    if (isAttending()) {
      if (releaseAttention || requesting) return;
      requesting = true;
      void navigator.locks.request(
        tabLock,
        () =>
          new Promise<void>((resolve) => {
            requesting = false;
            if (stopped || !isAttending()) return resolve();
            releaseAttention = resolve;
          }),
      );
    } else if (releaseAttention) {
      releaseAttention();
      releaseAttention = null;
    }
  }

  update();
  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
  return () => {
    stopped = true;
    isLeader = false;
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("focus", update);
    window.removeEventListener("blur", update);
    releaseAttention?.();
    releaseLeader?.();
  };
}

/** Alguma aba do Workboard está na frente, com foco. */
async function someoneAttending() {
  if (!hasLocks()) return isAttending();
  const { held = [] } = await navigator.locks.query();
  return held.some((lock) => lock.name?.startsWith(ATTENTION_PREFIX));
}

function supportsNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export type SystemNotificationPermission = NotificationPermission | "unsupported";

const permissionListeners = new Set<() => void>();

function readPermission(): SystemNotificationPermission {
  return supportsNotifications() ? Notification.permission : "unsupported";
}

/** Permissão do navegador para notificações do sistema (atualiza quando muda). */
export function useSystemNotificationPermission() {
  return useSyncExternalStore(
    (listener) => {
      permissionListeners.add(listener);
      return () => {
        permissionListeners.delete(listener);
      };
    },
    readPermission,
    () => "default" as SystemNotificationPermission,
  );
}

/** Pede a permissão (precisa vir de um clique). */
export async function requestSystemNotificationPermission() {
  if (!supportsNotifications()) return "unsupported" as const;
  const result = await Notification.requestPermission();
  for (const listener of permissionListeners) listener();
  return result;
}

type SystemNotice = {
  title: string;
  body: string;
  /** Avisos com a mesma tag se substituem (a mensagem nova de uma conversa tira a anterior). */
  tag: string;
  icon?: string | null;
  onClick?: () => void;
};

/** As abertas por tag: a nova fecha a anterior e aparece de novo na tela. */
const shown = new Map<string, Notification>();

/** Mostra a notificação do sistema se esta aba é a líder, há permissão e ninguém está olhando. */
export async function showSystemNotification(notice: SystemNotice) {
  if (!isLeader || readPermission() !== "granted") return;
  if (await someoneAttending()) return;
  try {
    // Com a mesma tag, o navegador só trocaria o texto em silêncio, sem mostrar de novo.
    shown.get(notice.tag)?.close();
    const notification = new Notification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      icon: notice.icon ?? undefined,
      // O som é o do Workboard (notification-sound.ts), que respeita as Configurações.
      silent: true,
    });
    shown.set(notice.tag, notification);
    notification.onclose = () => {
      if (shown.get(notice.tag) === notification) shown.delete(notice.tag);
    };
    notification.onclick = () => {
      window.focus();
      notice.onClick?.();
      notification.close();
    };
  } catch {
    // Navegadores de celular só mostram notificação por service worker: fica só o aviso na tela.
  }
}
