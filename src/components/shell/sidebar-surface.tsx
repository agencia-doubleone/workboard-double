"use client";

import { createContext, use } from "react";

import { usePreferences } from "@/components/preferences/preferences-store";

type SidebarSurface = {
  /** "desktop" = coluna fixa (pode recolher). "mobile" = gaveta. */
  surface: "desktop" | "mobile";
  onNavigate?: () => void;
};

export const SidebarSurfaceContext = createContext<SidebarSurface>({
  surface: "desktop",
});

/** Estado efetivo da superfície atual: a gaveta mobile nunca fica recolhida. */
export function useSidebarSurface() {
  const { surface, onNavigate } = use(SidebarSurfaceContext);
  const { sidebarCollapsed } = usePreferences();
  return {
    surface,
    onNavigate,
    collapsed: surface === "desktop" && sidebarCollapsed,
  };
}

/** Rótulos que somem ao recolher (rápido) e reaparecem após a largura abrir. */
export const sidebarFadeClass =
  "whitespace-nowrap transition-opacity duration-150 delay-75 motion-reduce:transition-none sidebar-collapsed:opacity-0 sidebar-collapsed:duration-100 sidebar-collapsed:delay-0";
