import { CalendarRangeIcon, HouseIcon, InboxIcon } from "lucide-react";

import { isActiveItem, type NavItem } from "@/components/shell/nav-config";
import { PORTAL_HOME_PATH, PORTAL_PLANNING_PATH, PORTAL_PROFILE_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";

// Menu do portal do cliente. "Planejamento" só aparece para quem tem algum mês
// do planejamento já enviado (decidido no servidor, ver portal/layout.tsx).
export const PORTAL_NAV: NavItem[] = [
  { title: "Início", href: PORTAL_HOME_PATH, icon: HouseIcon, exact: true },
  { title: "Solicitações", href: PORTAL_REQUESTS_PATH, icon: InboxIcon },
];

export const PORTAL_PLANNING_ITEM: NavItem = { title: "Planejamento", href: PORTAL_PLANNING_PATH, icon: CalendarRangeIcon };

/** Páginas fora do menu (pela foto no header). */
const EXTRA_TITLES: Record<string, string> = {
  [PORTAL_PROFILE_PATH]: "Meu perfil",
};

export function getPortalNavTitle(pathname: string) {
  return [...PORTAL_NAV, PORTAL_PLANNING_ITEM].find((item) => isActiveItem(pathname, item))?.title ?? EXTRA_TITLES[pathname];
}
