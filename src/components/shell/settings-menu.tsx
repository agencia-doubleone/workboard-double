"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { MonitorIcon, MoonIcon, PartyPopperIcon, Settings2Icon, SunIcon, Volume2Icon, VolumeXIcon } from "lucide-react";

import { celebrate as previewCelebration } from "@/components/celebration";
import { Hint } from "@/components/hint";
import {
  setAccent,
  setCelebrate,
  setNotificationSound,
  setThemeMode,
  usePreferences,
} from "@/components/preferences/preferences-store";
import { previewNotificationSound } from "@/components/realtime/notification-sound";
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

/** Rodapé da sidebar: preferências de interface deste navegador (tema, cor de destaque, som e comemoração). */
export function SettingsMenu() {
  const { mode, accent, sound, celebrate } = usePreferences();
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
        className="w-72"
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

        <DropdownMenuGroup>
          <DropdownMenuLabel>Avisos e comemorações</DropdownMenuLabel>
          <ToggleItem
            checked={sound}
            onCheckedChange={(checked) => {
              setNotificationSound(checked);
              // Ao ligar, uma amostra (e o clique já libera o áudio nesta aba).
              if (checked) previewNotificationSound();
            }}
            icon={sound ? Volume2Icon : VolumeXIcon}
            label="Som dos avisos"
          />
          <ToggleItem
            checked={celebrate}
            onCheckedChange={(checked) => {
              setCelebrate(checked);
              if (checked) previewCelebration({ force: true });
            }}
            icon={PartyPopperIcon}
            label="Comemorar entregas concluídas"
          />
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-muted-foreground">Vale só para este navegador.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Linha com interruptor: o item inteiro é o controle (role menuitemcheckbox); o interruptor é só visual. */
function ToggleItem({
  checked,
  onCheckedChange,
  icon: Icon,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      closeOnClick={false}
      className="group/toggle flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <span
        aria-hidden="true"
        className="relative h-[18px] w-8 shrink-0 rounded-full bg-input transition-colors group-data-checked/toggle:bg-primary"
      >
        <span className="absolute top-px left-px size-4 rounded-full bg-background shadow-[0_1px_2px_oklch(0_0_0/0.2)] transition-transform duration-200 ease-(--ease-snappy) group-data-checked/toggle:translate-x-[14px] dark:bg-foreground dark:group-data-checked/toggle:bg-primary-foreground" />
      </span>
    </MenuPrimitive.CheckboxItem>
  );
}
