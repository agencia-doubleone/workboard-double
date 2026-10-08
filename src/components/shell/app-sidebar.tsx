"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Hint } from "@/components/hint";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";
import { isActivePath, NAV_SECTIONS, type NavItem, type NavSectionId } from "./nav-config";
import { useShell } from "./shell-provider";
import {
  sidebarFadeClass,
  SidebarSurfaceContext,
  useSidebarSurface,
} from "./sidebar-surface";

type AppSidebarProps = {
  /** Seções que dependem do usuário (renderizadas no servidor, em Suspense). */
  adminNav?: React.ReactNode;
  userMenu: React.ReactNode;
};

export function AppSidebar(props: AppSidebarProps) {
  const { mobileOpen, setMobileOpen } = useShell();

  return (
    <>
      <aside
        data-slot="app-sidebar"
        className="hidden h-svh w-(--sidebar-width) shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-(--ease-snappy) motion-reduce:transition-none md:flex sidebar-collapsed:w-(--sidebar-width-icon)"
      >
        <SidebarBody {...props} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="gap-0 bg-sidebar p-0 text-sidebar-foreground data-[side=left]:w-(--sidebar-width) data-[side=left]:max-w-[85vw] md:hidden"
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SidebarSurfaceContext
            value={{ surface: "mobile", onNavigate: () => setMobileOpen(false) }}
          >
            <SidebarBody {...props} />
          </SidebarSurfaceContext>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarBody({ adminNav, userMenu }: AppSidebarProps) {
  const { onNavigate } = useSidebarSurface();

  return (
    <>
      <div className="flex h-12 shrink-0 items-center px-3 md:mt-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
        >
          <BrandMark />
          <span className={cn("truncate text-sm font-semibold tracking-tight", sidebarFadeClass)}>
            Workboard
          </span>
        </Link>
      </div>

      <nav
        aria-label="Principal"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-3"
      >
        <NavSection id="main" />
        {adminNav}
      </nav>

      <div className="shrink-0 px-3 pt-2 pb-3">{userMenu}</div>
    </>
  );
}

export function NavSection({ id }: { id: NavSectionId }) {
  const section = NAV_SECTIONS[id];

  return (
    <div className="flex flex-col gap-0.5">
      {"label" in section && (
        <div className="relative flex h-8 items-center px-2">
          <span className={cn("text-xs font-medium text-muted-foreground", sidebarFadeClass)}>
            {section.label}
          </span>
          {/* Recolhida: o rótulo vira um divisor discreto. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-sidebar-border opacity-0 transition-opacity duration-150 sidebar-collapsed:opacity-100"
          />
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </ul>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const { collapsed, onNavigate } = useSidebarSurface();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <li>
      <Hint label={item.title} side="right" sideOffset={14} disabled={!collapsed}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="group/nav-item flex h-8 items-center gap-2.5 overflow-hidden rounded-md px-2 text-[13px] font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/nav-item:text-sidebar-foreground group-aria-[current=page]/nav-item:text-primary" />
          <span className={cn("truncate", sidebarFadeClass)}>{item.title}</span>
        </Link>
      </Hint>
    </li>
  );
}
