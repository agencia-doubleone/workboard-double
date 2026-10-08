import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { PreferencesListener } from "@/components/preferences/preferences-listener";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { preferencesScript } from "@/lib/preferences";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | Workboard",
    default: "Workboard",
  },
  description: "Controle dos trabalhos da agência.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: o script abaixo altera class/data-* do <html>
    // antes da hidratação.
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider delay={350} closeDelay={0}>
          {children}
        </TooltipProvider>
        <Toaster position="bottom-right" />
        <PreferencesListener />
      </body>
    </html>
  );
}
