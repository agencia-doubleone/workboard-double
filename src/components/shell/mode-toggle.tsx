"use client";

import { MoonIcon, SunIcon } from "lucide-react";

import { Hint } from "@/components/hint";
import { toggleThemeMode } from "@/components/preferences/preferences-store";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
  return (
    <Hint label="Alternar tema" side="bottom">
      <Button variant="ghost" size="icon-sm" onClick={toggleThemeMode}>
        {/* Ícone decidido por CSS, sem esperar a hidratação. */}
        <SunIcon className="dark:hidden" />
        <MoonIcon className="hidden dark:block" />
        <span className="sr-only">Alternar tema</span>
      </Button>
    </Hint>
  );
}
