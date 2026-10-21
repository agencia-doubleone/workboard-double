"use client";

import { NavGroup, ShellSidebar, SidebarBrand, SidebarFooter, SidebarNav } from "@/components/shell/app-sidebar";
import { SettingsMenu } from "@/components/shell/settings-menu";
import { PORTAL_HOME_PATH } from "@/lib/portal";
import { PORTAL_NAV, PORTAL_PLANNING_ITEM } from "./portal-nav";

/**
 * Sidebar do portal do cliente: a mesma do Workboard, com o menu do portal e só
 * tema e cor nas Configurações. `nav` vem do layout (o menu depende do cliente,
 * lido no servidor dentro de um Suspense).
 */
export function PortalSidebar({ nav }: { nav: React.ReactNode }) {
  return (
    <ShellSidebar>
      <SidebarBrand href={PORTAL_HOME_PATH} label="Portal do cliente" />
      <SidebarNav>{nav}</SidebarNav>
      <SidebarFooter>
        <SettingsMenu portal />
      </SidebarFooter>
    </ShellSidebar>
  );
}

/** O menu principal do portal; com `planning`, inclui o planejamento (o cliente tem algum mês enviado). */
export function PortalNavGroup({ planning }: { planning: boolean }) {
  return <NavGroup items={planning ? [...PORTAL_NAV, PORTAL_PLANNING_ITEM] : PORTAL_NAV} />;
}
