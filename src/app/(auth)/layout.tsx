import { DoubleOneLogo } from "@/components/double-one-logo";
import { FixedTheme } from "@/components/preferences/fixed-theme";
import { AuthBackground } from "./auth-background";

/**
 * Moldura das telas públicas (login, redefinir senha): fundo preto em tela
 * cheia com as ondas de pontos e, no centro, o formulário num painel escuro
 * translúcido. As cores são fixas (escuro grafite), sem seguir o tema de quem usa.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-backdrop relative isolate flex min-h-svh items-center justify-center overflow-hidden p-5">
      <FixedTheme />
      <AuthBackground />
      <section className="flex w-full max-w-[26rem] flex-col gap-8 rounded-2xl border bg-background/55 p-8 shadow-overlay inset-shadow-highlight backdrop-blur-xl sm:p-10">
        <DoubleOneLogo className="h-10 self-center text-foreground" />
        {children}
      </section>
    </main>
  );
}
