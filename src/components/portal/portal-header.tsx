"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { ShellHeader } from "@/components/shell/app-header";
import { PortalNotificationBell } from "./portal-notification-bell";
import { getPortalNavTitle } from "./portal-nav";

/** Header do portal: o do Workboard, com o sino do portal e a conta (sem a busca). */
export function PortalHeader({ userMenu }: { userMenu: React.ReactNode }) {
  return (
    <ShellHeader
      title={
        <Suspense fallback="Portal do cliente">
          <PortalHeaderTitle />
        </Suspense>
      }
    >
      <PortalNotificationBell />
      {userMenu}
    </ShellHeader>
  );
}

function PortalHeaderTitle() {
  const pathname = usePathname();
  return getPortalNavTitle(pathname) ?? "Portal do cliente";
}
