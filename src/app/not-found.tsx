import type { Metadata } from "next";

import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Página não encontrada" };

/** Endereço que não existe (fora do shell). */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-1 bg-background text-foreground">
      <NotFoundView className="flex-1" />
    </main>
  );
}
