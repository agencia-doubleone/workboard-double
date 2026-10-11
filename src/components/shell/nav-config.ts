import {
  Building2Icon,
  CalendarDaysIcon,
  ChartColumnIcon,
  HardDriveIcon,
  HouseIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  PresentationIcon,
  ScrollTextIcon,
  SheetIcon,
  Table2Icon,
  TagsIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Contador ao lado (vem do tempo real, src/components/realtime). */
  badge?: "chats";
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const NAV_SECTIONS = {
  main: {
    items: [
      { title: "Início", href: "/", icon: HouseIcon },
      { title: "Minha planilha", href: "/minha-planilha", icon: SheetIcon },
      { title: "Calendário", href: "/calendario", icon: CalendarDaysIcon },
      { title: "Planejamentos", href: "/planejamentos", icon: NotebookPenIcon },
      { title: "Quadros", href: "/quadros", icon: PresentationIcon },
      { title: "Chat", href: "/chat", icon: MessagesSquareIcon, badge: "chats" },
      { title: "Clientes", href: "/clientes", icon: Building2Icon },
      { title: "Conquistas", href: "/conquistas", icon: TrophyIcon },
    ],
  },
  admin: {
    label: "Administração",
    items: [
      // A lista geral é só dos admins; a equipe acompanha os trabalhos na Minha planilha.
      { title: "Trabalhos", href: "/trabalhos", icon: Table2Icon },
      { title: "Relatórios", href: "/relatorios", icon: ChartColumnIcon },
      { title: "Usuários", href: "/usuarios", icon: UsersIcon },
      { title: "Status de trabalhos", href: "/status-de-trabalhos", icon: TagsIcon },
      { title: "Arquivos", href: "/arquivos", icon: HardDriveIcon },
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
