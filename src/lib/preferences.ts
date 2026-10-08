// Preferências de interface por dispositivo (localStorage).
// Compartilhado entre o script pré-pintura (servidor) e o store do cliente.

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const ACCENTS = [
  { id: "graphite", label: "Grafite", swatch: "oklch(0.45 0 0)" },
  { id: "blue", label: "Azul", swatch: "oklch(0.55 0.2 262)" },
  { id: "green", label: "Verde", swatch: "oklch(0.62 0.14 162)" },
  { id: "amber", label: "Âmbar", swatch: "oklch(0.75 0.16 70)" },
  { id: "rose", label: "Rosa", swatch: "oklch(0.58 0.22 17)" },
  { id: "violet", label: "Violeta", swatch: "oklch(0.55 0.24 293)" },
] as const;
export type Accent = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: Accent = "graphite";

export type Preferences = {
  mode: ThemeMode;
  accent: Accent;
  sidebarCollapsed: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  mode: "system",
  accent: DEFAULT_ACCENT,
  sidebarCollapsed: false,
};

export const STORAGE_KEYS = {
  mode: "wb:theme-mode",
  accent: "wb:accent",
  sidebar: "wb:sidebar",
} as const;

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

export function isAccent(value: unknown): value is Accent {
  return ACCENTS.some((accent) => accent.id === value);
}

/**
 * Roda no <head> antes da primeira pintura: aplica tema, cor e estado da
 * sidebar direto no <html>, evitando flash. Mantenha em sincronia com
 * applyTheme/applySidebar em preferences-store.ts.
 */
export const preferencesScript = `(() => {
  try {
    const keys = ${JSON.stringify(STORAGE_KEYS)};
    const accents = ${JSON.stringify(ACCENTS.map((accent) => accent.id))};
    const root = document.documentElement;
    const mode = localStorage.getItem(keys.mode);
    const dark = mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    const accent = localStorage.getItem(keys.accent);
    if (accent && accent !== "${DEFAULT_ACCENT}" && accents.includes(accent)) root.dataset.accent = accent;
    if (localStorage.getItem(keys.sidebar) === "collapsed") root.dataset.sidebar = "collapsed";
  } catch {}
})()`;
