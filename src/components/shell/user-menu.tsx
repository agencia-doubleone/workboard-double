"use client";

import { CakeIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BirthdayBalloons } from "@/components/birthday-balloons";
import { Hint } from "@/components/hint";
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
};

/** Canto do header: saudação e a foto, que abre a conta (perfil e sair). */
export function UserMenu({ user, firstName, greeting, isBirthday }: UserMenuProps) {
  const router = useRouter();
  const [isSigningOut, startSignOut] = useTransition();
  // 0 = soltura automática (uma vez por dia); cada clique na saudação solta de novo.
  const [launches, setLaunches] = useState(0);

  function handleSignOut() {
    startSignOut(async () => {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      {isBirthday ? (
        <>
          <Hint label="Soltar os balões de novo" side="bottom">
            <button
              type="button"
              onClick={() => setLaunches((count) => count + 1)}
              className="hidden items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-primary-ink outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex"
            >
              <CakeIcon className="size-4" />
              Feliz aniversário, {firstName}!
            </button>
          </Hint>
          <BirthdayBalloons key={launches} oncePerDay={launches === 0} />
        </>
      ) : (
        <p className="hidden text-sm text-muted-foreground sm:block">
          {greeting}, <span className="font-medium text-foreground">{firstName}</span>
        </p>
      )}
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
