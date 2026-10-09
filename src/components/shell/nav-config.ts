import {
  Building2Icon,
  HouseIcon,
  ScrollTextIcon,
  Table2Icon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const NAV_SECTIONS = {
  main: {
    items: [
      { title: "Início", href: "/", icon: HouseIcon },
      { title: "Trabalhos", href: "/trabalhos", icon: Table2Icon },
      { title: "Clientes", href: "/clientes", icon: Building2Icon },
    ],
  },
  admin: {
    label: "Administração",
    items: [
      { title: "Usuários", href: "/usuarios", icon: UsersIcon },
      { title: "Auditoria", href: "/auditoria", icon: ScrollTextIcon },
    ],
  },
} satisfies Record<string, NavSection>;

export type NavSectionId = keyof typeof NAV_SECTIONS;

const ALL_ITEMS: NavItem[] = Object.values(NAV_SECTIONS).flatMap(
  (section) => section.items,
);

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Páginas fora da navegação lateral (acessadas pelo menu do usuário). */
const EXTRA_TITLES: Record<string, string> = {
  "/perfil": "Meu perfil",
};

export function getNavTitle(pathname: string) {
  return (
    ALL_ITEMS.find((item) => isActivePath(pathname, item.href))?.title ?? EXTRA_TITLES[pathname]
  );
}
