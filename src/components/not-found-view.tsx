"use client";

import { DoorClosedIcon, DoorOpenIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { reportAchievement } from "@/components/achievements/achievement-toasts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Página de "não encontrado" (endereço errado ou sem acesso). Tem uma porta
 * escondida no canto: abrir é a conquista "A Porta Estava Aberta" e leva à
 * página secreta (/bastidores).
 */
export function NotFoundView({ className }: { className?: string }) {
  const router = useRouter();

  function openDoor() {
    reportAchievement({ type: "door" });
    router.push("/bastidores");
  }

  return (
    <div className={cn("relative flex flex-col items-center justify-center gap-4 px-4 text-center", className)}>
      <p aria-hidden="true" className="text-7xl font-semibold tracking-tighter text-muted-foreground/30 tabular-nums">
        404
      </p>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O endereço pode estar errado, a página pode ter sido removida ou você não tem acesso a ela.
        </p>
      </div>
      <Link href="/" className={buttonVariants()}>
        Voltar ao início
      </Link>
      <button
        type="button"
        onClick={openDoor}
        aria-label="Porta"
        className="group/door absolute bottom-3 left-3 flex size-8 items-center justify-center rounded-md text-muted-foreground/25 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <DoorClosedIcon className="size-4 group-hover/door:hidden group-focus-visible/door:hidden" />
        <DoorOpenIcon className="hidden size-4 group-hover/door:block group-focus-visible/door:block" />
      </button>
    </div>
  );
}
