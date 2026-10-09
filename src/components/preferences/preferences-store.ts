"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_ACCENT,
  DEFAULT_PREFERENCES,
  isAccent,
  isThemeMode,
  STORAGE_KEYS,
  type Accent,
  type Preferences,
  type ThemeMode,
} from "@/lib/preferences";

// Store mínimo: localStorage é a fonte persistida e o <html> recebe os
// atributos visuais. O CSS reage aos atributos; o React só lê o estado para
// rótulos, aria e menus.

const DARK_QUERY = "(prefers-color-scheme: dark)";

let current: Preferences | null = null;
const listeners = new Set<() => void>();

function readStorage(): Preferences {
  try {
    const mode = localStorage.getItem(STORAGE_KEYS.mode);
    const accent = localStorage.getItem(STORAGE_KEYS.accent);
    return {
      mode: isThemeMode(mode) ? mode : DEFAULT_PREFERENCES.mode,
      accent: isAccent(accent) ? accent : DEFAULT_PREFERENCES.accent,
      sidebarCollapsed: localStorage.getItem(STORAGE_KEYS.sidebar) === "collapsed",
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeStorage(preferences: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEYS.mode, preferences.mode);
    localStorage.setItem(STORAGE_KEYS.accent, preferences.accent);
    localStorage.setItem(
      STORAGE_KEYS.sidebar,
      preferences.sidebarCollapsed ? "collapsed" : "expanded",
    );
  } catch {
    // Modo privado / storage bloqueado: a preferência vale só nesta aba.
  }
}

// Troca de tema sem disparar as transições de cor de todos os elementos.
function withoutTransitions(apply: () => void) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);
  apply();
  void window.getComputedStyle(document.body).opacity;
  requestAnimationFrame(() => style.remove());
}

function applyTheme({ mode, accent }: Preferences) {
  const root = document.documentElement;
  const dark =
    mode === "dark" || (mode === "system" && matchMedia(DARK_QUERY).matches);

  withoutTransitions(() => {
    root.classList.toggle("dark", dark);
    if (accent === DEFAULT_ACCENT) delete root.dataset.accent;
    else root.dataset.accent = accent;
  });
}

function applySidebar({ sidebarCollapsed }: Preferences) {
  const root = document.documentElement;
  if (sidebarCollapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
}

function getSnapshot() {
  current ??= readStorage();
  return current;
}

function getServerSnapshot() {
  return DEFAULT_PREFERENCES;
}

function emit() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  const keys: (string | null)[] = Object.values(STORAGE_KEYS);
  if (!keys.includes(event.key)) return;
  current = readStorage();
  applyTheme(current);
  applySidebar(current);
  emit();
}

function handleSystemThemeChange() {
  if (getSnapshot().mode === "system") applyTheme(getSnapshot());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", handleStorage);
    matchMedia(DARK_QUERY).addEventListener("change", handleSystemThemeChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
      matchMedia(DARK_QUERY).removeEventListener("change", handleSystemThemeChange);
    }
  };
}

function commit(partial: Partial<Preferences>) {
  const next = { ...getSnapshot(), ...partial };
  current = next;
  writeStorage(next);
  if ("mode" in partial || "accent" in partial) applyTheme(next);
  if ("sidebarCollapsed" in partial) applySidebar(next);
  emit();
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setThemeMode(mode: ThemeMode) {
  commit({ mode });
}

export function setAccent(accent: Accent) {
  commit({ accent });
}

export function toggleSidebarCollapsed() {
  commit({ sidebarCollapsed: !getSnapshot().sidebarCollapsed });
}
