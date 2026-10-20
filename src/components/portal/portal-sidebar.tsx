"use client";

import { NavGroup, ShellSidebar, SidebarBrand, SidebarFooter, SidebarNav } from "@/components/shell/app-sidebar";
import { SettingsMenu } from "@/components/shell/settings-menu";
import { PORTAL_HOME_PATH } from "@/lib/portal";
import { PORTAL_NAV } from "./portal-nav";

/** Sidebar do portal do cliente: a mesma do Workboard, com o menu do portal e só tema e cor nas Configurações. */
export function PortalSidebar() {
  return (
    <ShellSidebar>
      <SidebarBrand href={PORTAL_HOME_PATH} label="Portal do cliente" />
      <SidebarNav>
        <NavGroup items={PORTAL_NAV} />
      </SidebarNav>
      <SidebarFooter>
        <SettingsMenu portal />
      </SidebarFooter>
    </ShellSidebar>
  );
}
