import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { ShellProvider } from "./shell-provider";

type AppShellProps = {
  adminNav?: React.ReactNode;
  userMenu: React.ReactNode;
  children: React.ReactNode;
};

/** Moldura do app: sidebar + painel de conteúdo com header. */
export function AppShell({ adminNav, userMenu, children }: AppShellProps) {
  return (
    <ShellProvider>
      <div className="flex h-svh overflow-hidden bg-sidebar text-sidebar-foreground">
        <AppSidebar adminNav={adminNav} />
        <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground md:rounded-xl md:border md:shadow-xs">
            <AppHeader userMenu={userMenu} />
            {/* relative: elementos absolutos sem pai posicionado (ex.: rótulos sr-only)
                ficam presos a esta área de rolagem, em vez de esticar a janela. */}
            <main className="relative flex-1 overflow-y-auto">
              {/* Largura total: planilhas precisam de espaço. Páginas de leitura
                  ou formulário limitam a própria largura. */}
              <div className="w-full px-4 py-6 md:px-8 md:py-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ShellProvider>
  );
}
