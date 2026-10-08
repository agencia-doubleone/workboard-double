"use client";

import { PanelLeftIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Hint } from "@/components/hint";
import { usePreferences } from "@/components/preferences/preferences-store";
import { Button } from "@/components/ui/button";
import { useModKey } from "@/hooks/use-mod-key";
import { ModeToggle } from "./mode-toggle";
import { getNavTitle } from "./nav-config";
import { useShell } from "./shell-provider";

export function AppHeader() {
  const pathname = usePathname();
  const { toggleSidebar } = useShell();
  const { sidebarCollapsed } = usePreferences();
  const modKey = useModKey();
  const label = sidebarCollapsed ? "Expandir menu" : "Recolher menu";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:px-3">
      <Hint label={label} shortcut={[modKey, "B"]} side="bottom">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        >
          <PanelLeftIcon />
          <span className="sr-only">{label}</span>
        </Button>
      </Hint>
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      <h2 className="truncate px-1 text-sm font-medium">
        {getNavTitle(pathname) ?? "Workboard"}
      </h2>
      <div className="ml-auto flex items-center gap-1">
        <ModeToggle />
      </div>
    </header>
  );
}
