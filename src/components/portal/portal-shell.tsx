import { ShellFrame } from "@/components/shell/app-shell";
import { PortalHeader } from "./portal-header";
import { PortalSidebar } from "./portal-sidebar";

/**
 * Moldura do portal do cliente: o mesmo shell do Workboard (sidebar recolhível,
 * header, tema e cor de destaque deste navegador), sem nada da equipe: nem
 * tempo real, nem conquistas, nem busca, nem sino.
 */
export function PortalShell({ nav, userMenu, children }: { nav: React.ReactNode; userMenu: React.ReactNode; children: React.ReactNode }) {
  return (
    <ShellFrame sidebar={<PortalSidebar nav={nav} />} header={<PortalHeader userMenu={userMenu} />}>
      {children}
    </ShellFrame>
  );
}
