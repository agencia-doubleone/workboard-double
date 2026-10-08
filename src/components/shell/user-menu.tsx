"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Hint } from "@/components/hint";
import {
  setAccent,
  setThemeMode,
  usePreferences,
} from "@/components/preferences/preferences-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { ACCENTS, isAccent, isThemeMode } from "@/lib/preferences";
import { cn, getInitials } from "@/lib/utils";
import { sidebarFadeClass, useSidebarSurface } from "./sidebar-surface";

export type UserMenuUser = {
  name: string;
  email: string;
  role: string;
};

const MODE_OPTIONS = [
  { value: "light", label: "Claro", icon: SunIcon },
  { value: "dark", label: "Escuro", icon: MoonIcon },
  { value: "system", label: "Sistema", icon: MonitorIcon },
] as const;

const optionClass =
  "flex cursor-default items-center justify-center rounded-md border border-transparent text-muted-foreground outline-none transition-colors select-none data-highlighted:bg-accent data-highlighted:text-foreground data-checked:border-border data-checked:bg-accent data-checked:text-foreground";

export function UserMenu({ user }: { user: UserMenuUser }) {
  const router = useRouter();
  const [isSigningOut, startSignOut] = useTransition();
  const { mode, accent } = usePreferences();
  const { collapsed, surface } = useSidebarSurface();
  const accentLabel = ACCENTS.find((option) => option.id === accent)?.label;

  function handleSignOut() {
    startSignOut(async () => {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <Hint label={user.name} side="right" sideOffset={14} disabled={!collapsed}>
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 overflow-hidden rounded-md p-0.5 text-left outline-none transition-colors hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 data-popup-open:bg-sidebar-accent">
          <UserAvatar name={user.name} />
          <span className={cn("grid min-w-0 flex-1 leading-tight", sidebarFadeClass)}>
            <span className="truncate text-[13px] font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDownIcon
            className={cn("mr-1 size-3.5 shrink-0 text-muted-foreground", sidebarFadeClass)}
          />
        </DropdownMenuTrigger>
      </Hint>

      <DropdownMenuContent
        side={surface === "desktop" && collapsed ? "right" : "top"}
        align={surface === "desktop" && collapsed ? "end" : "start"}
        sideOffset={8}
        className="w-64"
      >
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <UserAvatar name={user.name} />
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <span className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {user.role === "admin" ? "Admin" : "Membro"}
          </span>
        </div>

        <DropdownMenuSeparator />

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

        <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
          <LogOutIcon />
          {isSigningOut ? "Saindo..." : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-7 rounded-md after:rounded-md">
      <AvatarFallback className="rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-foreground">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}


export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2.5 p-0.5">
      <Skeleton className="size-7 shrink-0 rounded-md bg-sidebar-accent" />
      <div className={cn("grid flex-1 gap-1.5", sidebarFadeClass)}>
        <Skeleton className="h-3 w-24 bg-sidebar-accent" />
        <Skeleton className="h-2.5 w-32 bg-sidebar-accent" />
      </div>
    </div>
  );
}
