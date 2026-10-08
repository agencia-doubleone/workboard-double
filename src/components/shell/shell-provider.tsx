"use client";

import { createContext, use, useCallback, useEffect, useState } from "react";

import { toggleSidebarCollapsed } from "@/components/preferences/preferences-store";

const DESKTOP_QUERY = "(min-width: 48rem)";

type ShellContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Desktop: recolhe/expande. Mobile: abre/fecha o menu lateral. */
  toggleSidebar: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (matchMedia(DESKTOP_QUERY).matches) toggleSidebarCollapsed();
    else setMobileOpen((open) => !open);
  }, []);

  // Atalho Ctrl/⌘ + B.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === "b" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // Fecha o menu mobile se a janela crescer para desktop.
  useEffect(() => {
    const query = matchMedia(DESKTOP_QUERY);
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return (
    <ShellContext value={{ mobileOpen, setMobileOpen, toggleSidebar }}>
      {children}
    </ShellContext>
  );
}

export function useShell() {
  const context = use(ShellContext);
  if (!context) throw new Error("useShell precisa estar dentro de <ShellProvider>");
  return context;
}
