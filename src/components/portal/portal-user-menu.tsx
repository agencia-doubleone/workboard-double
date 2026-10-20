"use client";

import { LogOutIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { ClientLogo } from "@/components/client-logo";
import { HeaderGreeting, type SpecialGreeting } from "@/components/shell/header-greeting";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { PORTAL_PROFILE_PATH, PORTAL_SIGN_IN_PATH } from "@/lib/portal";
import { portalAuthClient } from "@/lib/portal-auth-client";

export type PortalUserMenuProps = {
  contact: {
    name: string;
    email: string;
    /** Foto já resolvida para URL (resolveMediaUrl), ou null. */
    imageUrl: string | null;
  };
  client: { name: string; logoUrl: string | null };
  /** Primeiro nome e "Bom dia"/"Boa tarde"/"Boa noite", calculados no servidor (src/lib/greeting.ts). */
  firstName: string;
  greeting: string;
  /** Aniversário da empresa ou data especial (Halloween, Natal, Ano Novo), como no Workboard. */
  special: SpecialGreeting | null;
};

/** Canto do header do portal: saudação e a foto, que abre a conta (perfil e sair), como no Workboard. */
export function PortalUserMenu({ contact, client, firstName, greeting, special }: PortalUserMenuProps) {
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOut() {
    startSignOut(async () => {
      await portalAuthClient.signOut();
      // Recarrega a página inteira, como o sair da equipe: nada da sessão fica guardado escondido.
      window.location.replace(PORTAL_SIGN_IN_PATH);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <HeaderGreeting firstName={firstName} greeting={greeting} special={special} />
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Abrir menu da conta"
          className="rounded-md outline-none transition-[opacity,box-shadow] hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:ring-2 data-popup-open:ring-ring/30"
        >
          <UserAvatar name={contact.name} imageUrl={contact.imageUrl} className="size-8" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <UserAvatar name={contact.name} imageUrl={contact.imageUrl} className="size-8" />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{contact.name}</span>
              <span className="truncate text-xs text-muted-foreground">{contact.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-1.5 pb-1.5">
            <ClientLogo name={client.name} logoUrl={client.logoUrl} className="size-5 text-[8px]" />
            <span className="truncate text-xs text-muted-foreground">{client.name}</span>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem render={<Link href={PORTAL_PROFILE_PATH} />}>
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
