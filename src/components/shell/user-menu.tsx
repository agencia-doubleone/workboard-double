"use client";

import { LogOutIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth-client";
import type { Holiday } from "@/lib/greeting";
import { HeaderGreeting } from "./header-greeting";

export type UserMenuUser = {
  name: string;
  email: string;
  role: string;
  /** Foto já resolvida para URL (resolveMediaUrl), ou null. */
  imageUrl: string | null;
};

type UserMenuProps = {
  user: UserMenuUser;
  /** Primeiro nome e "Bom dia"/"Boa tarde"/"Boa noite", calculados no servidor (src/lib/greeting.ts). */
  firstName: string;
  greeting: string;
  /** Hoje é o aniversário: troca a saudação e solta os balões. */
  isBirthday: boolean;
  /** Data especial (Halloween, Natal, Ano Novo): saudação do tema e a animação dela. O aniversário vem antes. */
  holiday: { id: Holiday; greeting: string } | null;
};

/** Canto do header: saudação e a foto, que abre a conta (perfil e sair). */
export function UserMenu({ user, firstName, greeting, isBirthday, holiday }: UserMenuProps) {
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOut() {
    startSignOut(async () => {
      await authClient.signOut();
      // Recarrega a página inteira: as telas guardadas pelo Next (formulários, conversas)
      // não podem sobrar para quem entrar depois neste navegador.
      window.location.replace("/login");
    });
  }

  return (
    <div className="flex items-center gap-3">
      <HeaderGreeting
        firstName={firstName}
        greeting={greeting}
        special={
          isBirthday
            ? { kind: "birthday", text: `Feliz aniversário, ${firstName}!` }
            : holiday
              ? { kind: "holiday", holiday: holiday.id, text: holiday.greeting }
              : null
        }
      />
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Abrir menu da conta"
          className="rounded-md outline-none transition-[opacity,box-shadow] hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:ring-2 data-popup-open:ring-ring/30"
        >
          <UserAvatar name={user.name} imageUrl={user.imageUrl} className="size-8" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <UserAvatar name={user.name} imageUrl={user.imageUrl} className="size-8" />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <span className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {user.role === "admin" ? "Admin" : "Membro"}
            </span>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem render={<Link href="/perfil" />}>
            <UserRoundIcon />
            Meu perfil
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
            <LogOutIcon />
            {isSigningOut ? "Saindo..." : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="hidden h-3.5 w-28 sm:block" />
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
      <Skeleton className="size-8 rounded-md" />
    </div>
  );
}
