"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useRef } from "react";

import { reportAchievement } from "@/components/achievements/achievement-toasts";
import { DoubleOneLogo } from "@/components/double-one-logo";
import { Hint } from "@/components/hint";
import { useRealtime } from "@/components/realtime/realtime-store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  isActiveItem,
  NAV_SECTIONS,
  type NavItem,
  type NavSection as NavSectionConfig,
  type NavSectionId,
} from "./nav-config";
import { SettingsMenu } from "./settings-menu";
import { useShell } from "./shell-provider";
import {
  sidebarFadeClass,
  SidebarSurfaceContext,
  useSidebarSurface,
} from "./sidebar-surface";

type AppSidebarProps = {
  /** Seção que depende do usuário (renderizada no servidor, em Suspense). */
  adminNav?: React.ReactNode;
};

export function AppSidebar(props: AppSidebarProps) {
  return (
    <ShellSidebar>
      <SidebarBody {...props} />
    </ShellSidebar>
  );
}

/**
 * A coluna da sidebar no desktop e a gaveta no celular, com o mesmo conteúdo
 * (children aparece nas duas, cada uma com a sua superfície). Usada pelo
 * Workboard e pelo portal do cliente.
 */
export function ShellSidebar({ children }: { children: React.ReactNode }) {
  const { mobileOpen, setMobileOpen } = useShell();

  return (
    <>
      <aside
        data-slot="app-sidebar"
        className="hidden h-svh w-(--sidebar-width) shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-(--ease-snappy) motion-reduce:transition-none md:flex sidebar-collapsed:w-(--sidebar-width-icon) print:hidden!"
      >
        {children}
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
            {children}
          </SidebarSurfaceContext>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Cliques no logo com menos disso entre um e outro contam como "seguidos". */
const LOGO_CLICK_GAP_MS = 800;

function SidebarBody({ adminNav }: AppSidebarProps) {
  const logoClicks = useRef({ count: 0, last: 0 });

  // Segredo: 10 cliques seguidos no logo ("O Que Você Tá Procurando?").
  function handleLogoClick(event: React.MouseEvent) {
    const { count, last } = logoClicks.current;
    const streak = event.timeStamp - last < LOGO_CLICK_GAP_MS ? count + 1 : 1;
    logoClicks.current = { count: streak, last: event.timeStamp };
    if (streak === 10) reportAchievement({ type: "logo" });
  }

  return (
    <>
      <SidebarBrand href="/" label="Workboard" onClick={handleLogoClick} />

      <SidebarNav>
        <NavSection id="main" />
        {adminNav}
      </SidebarNav>

      <SidebarFooter>
        <SettingsMenu />
      </SidebarFooter>
    </>
  );
}

/** Topo da sidebar: o logo da Double One e o nome da área, levando ao início dela. */
export function SidebarBrand({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: (event: React.MouseEvent) => void;
}) {
  const { onNavigate } = useSidebarSurface();

  return (
    <div className="flex h-12 shrink-0 items-center px-3 md:mt-2">
      <Link
        href={href}
        onClick={(event) => {
          onNavigate?.();
          onClick?.(event);
        }}
        className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
      >
        {/* Caixa de 32 px: com a sidebar recolhida, o logo fica alinhado aos ícones. */}
        <span className="flex size-8 shrink-0 items-center justify-center">
          <DoubleOneLogo className="h-7 text-sidebar-foreground" />
        </span>
        <span className={cn("truncate text-sm font-semibold tracking-tight", sidebarFadeClass)}>
          {label}
        </span>
      </Link>
    </div>
  );
}

export function SidebarNav({ children }: { children: React.ReactNode }) {
  return (
    <nav
      aria-label="Principal"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-3"
    >
      {children}
    </nav>
  );
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 px-3 pt-2 pb-3">{children}</div>;
}

export function NavSection({ id }: { id: NavSectionId }) {
  const section: NavSectionConfig = NAV_SECTIONS[id];
  return <NavGroup label={section.label} items={section.items} />;
}

/** Um grupo de links da sidebar, com rótulo opcional. */
export function NavGroup({ label, items }: NavSectionConfig) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <div className="relative flex h-8 items-center px-2">
          <span className={cn("text-xs font-medium text-muted-foreground", sidebarFadeClass)}>
            {label}
          </span>
          {/* Recolhida: o rótulo vira um divisor discreto. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-sidebar-border opacity-0 transition-opacity duration-150 sidebar-collapsed:opacity-100"
          />
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </ul>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <li>
      {/* O item ativo depende do caminho, que em rotas com parâmetro só existe no
          request: o Suspense mantém o resto da sidebar no shell estático. */}
      <Suspense fallback={<NavLinkAnchor item={item} active={false} />}>
        <ActiveNavLink item={item} />
      </Suspense>
    </li>
  );
}

function ActiveNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  return <NavLinkAnchor item={item} active={isActiveItem(pathname, item)} />;
}

/** Número de não lidas do item; com a sidebar recolhida, vira um ponto sobre o ícone. */
function NavBadge({ kind }: { kind: NonNullable<NavItem["badge"]> }) {
  const value = useRealtime((state) => state.counts?.[kind] ?? 0);
  if (value === 0) return null;
  return (
    <>
      <span
        className={cn(
          "ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums",
          sidebarFadeClass,
        )}
      >
        {value > 99 ? "99+" : value}
        <span className="sr-only">{kind === "requests" ? " com novidades" : " com mensagens novas"}</span>
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 left-5 size-2 rounded-full bg-primary opacity-0 ring-2 ring-sidebar transition-opacity sidebar-collapsed:opacity-100"
      />
    </>
  );
}

function NavLinkAnchor({ item, active }: { item: NavItem; active: boolean }) {
  const { collapsed, onNavigate } = useSidebarSurface();
  const Icon = item.icon;

  return (
    <>
      <Hint label={item.title} side="right" sideOffset={14} disabled={!collapsed}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="group/nav-item relative flex h-8 items-center gap-2.5 overflow-hidden rounded-md px-2 text-[13px] font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 aria-[current=page]:bg-(--nav-active) aria-[current=page]:text-primary-ink aria-[current=page]:hover:bg-(--nav-active) [--nav-active:color-mix(in_oklab,var(--primary)_14%,var(--sidebar))]"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/nav-item:text-sidebar-foreground group-aria-[current=page]/nav-item:text-primary-ink" />
          <span className={cn("truncate", sidebarFadeClass)}>{item.title}</span>
          {item.badge && <NavBadge kind={item.badge} />}
        </Link>
      </Hint>
    </>
  );
}
