import { AchievementTracker } from "@/components/achievements/achievement-tracker";
import { RealtimeConnection } from "@/components/realtime/realtime-connection";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { ShellProvider } from "./shell-provider";

type AppShellProps = {
  adminNav?: React.ReactNode;
  userMenu: React.ReactNode;
  /** Busca global (Ctrl+K), no header. */
  search?: React.ReactNode;
  children: React.ReactNode;
};

/** Moldura do app: sidebar + painel de conteúdo com header. */
export function AppShell({ adminNav, userMenu, search, children }: AppShellProps) {
  return (
    <ShellFrame
      sidebar={<AppSidebar adminNav={adminNav} />}
      header={<AppHeader userMenu={userMenu} search={search} />}
      services={
        <>
          {/* Websocket do tempo real: contadores, avisos e eventos para as telas. */}
          <RealtimeConnection />
          {/* Conquistas: avisos do que foi desbloqueado, checagem do dia e os segredos. */}
          <AchievementTracker />
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}

type ShellFrameProps = {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  /** Componentes sem tela que vivem enquanto o shell está montado (ex.: o tempo real). */
  services?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * O desenho do shell (sidebar ao lado do painel com header), sem nada da equipe:
 * o AppShell e o portal do cliente (src/components/portal/portal-shell.tsx) montam em cima.
 */
export function ShellFrame({ sidebar, header, services, children }: ShellFrameProps) {
  return (
    <ShellProvider>
      {services}
      {/* Ao imprimir (ex.: relatórios), só o conteúdo: sem menu, sem header, sem rolagem interna. */}
      <div className="flex h-svh overflow-hidden bg-sidebar text-sidebar-foreground print:block print:h-auto print:overflow-visible print:bg-background">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2 print:block print:p-0!">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground md:rounded-xl md:border md:shadow-xs print:block print:overflow-visible print:border-0! print:shadow-none!">
            {header}
            {/* relative: elementos absolutos sem pai posicionado (ex.: rótulos sr-only)
                ficam presos a esta área de rolagem, em vez de esticar a janela. */}
            <main className="relative flex-1 overflow-y-auto print:overflow-visible">
              {/* Largura total: planilhas precisam de espaço. Páginas de leitura
                  ou formulário limitam a própria largura. */}
              <div className="w-full px-4 py-6 md:px-8 md:py-8 print:p-0!">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ShellProvider>
  );
}
