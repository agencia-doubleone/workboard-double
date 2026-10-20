import { HouseIcon, InboxIcon } from "lucide-react";

import { isActiveItem, type NavItem } from "@/components/shell/nav-config";
import { PORTAL_HOME_PATH, PORTAL_PROFILE_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";

// Menu do portal do cliente. As próximas fases (docs/portal-do-cliente.md)
// entram aqui: entregas para aprovação e planejamentos.
export const PORTAL_NAV: NavItem[] = [
  { title: "Início", href: PORTAL_HOME_PATH, icon: HouseIcon, exact: true },
  { title: "Solicitações", href: PORTAL_REQUESTS_PATH, icon: InboxIcon },
];

/** Páginas fora do menu (pela foto no header). */
const EXTRA_TITLES: Record<string, string> = {
  [PORTAL_PROFILE_PATH]: "Meu perfil",
};

export function getPortalNavTitle(pathname: string) {
  return PORTAL_NAV.find((item) => isActiveItem(pathname, item))?.title ?? EXTRA_TITLES[pathname];
}
