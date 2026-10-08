import { BrandMark } from "@/components/shell/brand";
import { ModeToggle } from "@/components/shell/mode-toggle";

/** Moldura das telas públicas (login, redefinir senha). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center bg-sidebar p-6">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2.5 self-center">
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight">Workboard</span>
        </div>
        {children}
        <p className="text-center text-xs text-muted-foreground">
          Acesso restrito à equipe da agência.
        </p>
      </div>
    </main>
  );
}
