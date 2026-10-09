"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { MonitorIcon, MoonIcon, Settings2Icon, SunIcon } from "lucide-react";

import { Hint } from "@/components/hint";
import {
  setAccent,
  setThemeMode,
  usePreferences,
} from "@/components/preferences/preferences-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCENTS, isAccent, isThemeMode } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { sidebarFadeClass, useSidebarSurface } from "./sidebar-surface";

const MODE_OPTIONS = [
  { value: "light", label: "Claro", icon: SunIcon },
  { value: "dark", label: "Escuro", icon: MoonIcon },
  { value: "system", label: "Sistema", icon: MonitorIcon },
] as const;

const optionClass =
  "flex cursor-default items-center justify-center rounded-md border border-transparent text-muted-foreground outline-none transition-colors select-none data-highlighted:bg-accent data-highlighted:text-foreground data-checked:border-border data-checked:bg-accent data-checked:text-foreground";

/** Rodapé da sidebar: preferências de interface deste navegador (tema e cor de destaque). */
export function SettingsMenu() {
  const { mode, accent } = usePreferences();
  const { collapsed, surface } = useSidebarSurface();
  const accentLabel = ACCENTS.find((option) => option.id === accent)?.label;
  // Sidebar recolhida no desktop: o menu abre ao lado, não para cima.
  const beside = surface === "desktop" && collapsed;

  return (
    <DropdownMenu>
      <Hint label="Configurações" side="right" sideOffset={14} disabled={!collapsed}>
        <DropdownMenuTrigger className="group/settings flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-2 text-left text-[13px] font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-foreground">
          <Settings2Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/settings:text-sidebar-foreground group-data-popup-open/settings:text-sidebar-foreground" />
          <span className={cn("truncate", sidebarFadeClass)}>Configurações</span>
        </DropdownMenuTrigger>
      </Hint>

      <DropdownMenuContent
        side={beside ? "right" : "top"}
        align={beside ? "end" : "start"}
        sideOffset={8}
        className="w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <MenuPrimitive.RadioGroup
            value={mode}
            onValueChange={(value) => isThemeMode(value) && setThemeMode(value)}
            className="grid grid-cols-3 gap-1 px-1 pb-1"
          >
            {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <MenuPrimitive.RadioItem
                key={value}
                value={value}
                closeOnClick={false}
                className={cn(optionClass, "h-12 flex-col gap-1 text-xs")}
              >
                <Icon className="size-4" />
                {label}
              </MenuPrimitive.RadioItem>
            ))}
          </MenuPrimitive.RadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            Cor de destaque
            <span className="text-foreground">{accentLabel}</span>
          </DropdownMenuLabel>
          <MenuPrimitive.RadioGroup
            value={accent}
            onValueChange={(value) => isAccent(value) && setAccent(value)}
            className="grid grid-cols-6 gap-1 px-1 pb-1"
          >
            {ACCENTS.map((option) => (
              <MenuPrimitive.RadioItem
                key={option.id}
                value={option.id}
                closeOnClick={false}
                aria-label={option.label}
                className={cn(optionClass, "group/swatch aspect-square")}
              >
                <span
                  className="size-4 rounded-full ring-1 ring-black/10 ring-inset transition-shadow group-data-checked/swatch:ring-2 group-data-checked/swatch:ring-foreground/80 group-data-checked/swatch:ring-offset-2 group-data-checked/swatch:ring-offset-accent dark:ring-white/15"
                  style={{ backgroundColor: option.swatch }}
                />
              </MenuPrimitive.RadioItem>
            ))}
          </MenuPrimitive.RadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-muted-foreground">Vale só para este navegador.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
