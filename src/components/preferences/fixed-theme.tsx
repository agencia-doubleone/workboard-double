"use client";

import { useLayoutEffect } from "react";

/**
 * Enquanto montado, o <html> ganha data-fixed-theme: a página fica sempre no
 * escuro grafite, sem seguir o modo nem a cor de destaque (veja globals.css). Na primeira carga quem põe o
 * atributo é o script do <head> (FIXED_THEME_PATHS em src/lib/preferences.ts);
 * este componente cobre a navegação no cliente (ex.: logout → login).
 */
export function FixedTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.fixedTheme = "";
    return () => {
      delete root.dataset.fixedTheme;
    };
  }, []);
  return null;
}
