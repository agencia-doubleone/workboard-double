"use client";

import { PanelLeftIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { Hint } from "@/components/hint";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { usePreferences } from "@/components/preferences/preferences-store";
import { Button } from "@/components/ui/button";
import { useModKey } from "@/hooks/use-mod-key";
import { getNavTitle } from "./nav-config";
import { useShell } from "./shell-provider";

/** Header do painel: recolher a sidebar, título da página, a busca, o sino e a conta (userMenu). */
export function AppHeader({ userMenu, search }: { userMenu: React.ReactNode; search?: React.ReactNode }) {
  return (
    <ShellHeader
      title={
        // Em rotas com parâmetro (ex.: /clientes/[slug]) o caminho só existe na
        // hora do request: sem o Suspense, o build não gera o shell estático.
        <Suspense fallback="Workboard">
          <HeaderTitle />
        </Suspense>
      }
    >
      {search}
      <NotificationBell />
      {userMenu}
    </ShellHeader>
  );
}

/** O header sem nada da equipe: botão da sidebar, título e, à direita, o que vier em children. */
export function ShellHeader({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const { toggleSidebar } = useShell();
  const { sidebarCollapsed } = usePreferences();
  const modKey = useModKey();
  const label = sidebarCollapsed ? "Expandir menu" : "Recolher menu";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:px-3 print:hidden">
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
      <h2 className="truncate px-1 text-sm font-medium">{title}</h2>
      <div className="ml-auto flex items-center gap-3 pr-1">{children}</div>
    </header>
  );
}

function HeaderTitle() {
  const pathname = usePathname();
  return getNavTitle(pathname) ?? "Workboard";
}
