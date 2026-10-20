import type { Metadata } from "next";
import { Suspense } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { PortalUserMenu } from "@/components/portal/portal-user-menu";
import { UserMenuSkeleton } from "@/components/shell/user-menu";
import { env } from "@/env";
import {
  companyAnniversaryYears,
  getFirstName,
  getGreeting,
  getHoliday,
  getHolidayGreeting,
  specialDayNow,
} from "@/lib/greeting";
import { requirePortalSession } from "@/lib/portal-session";
import { resolveMediaUrl } from "@/server/media";

export const metadata: Metadata = {
  title: { template: "%s | Portal do cliente · Double One", default: "Portal do cliente · Double One" },
};

/**
 * Moldura do portal do cliente: o shell do Workboard (sidebar, header, tema e
 * cor de destaque do navegador), com o menu e a conta do portal. A sessão é
 * lida dentro do <Suspense>, nunca no topo.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      userMenu={
        <Suspense fallback={<UserMenuSkeleton />}>
          <PortalUserMenuLoader />
        </Suspense>
      }
    >
      {children}
    </PortalShell>
  );
}

async function PortalUserMenuLoader() {
  const { contact, client } = await requirePortalSession();
  const now = new Date();
  const specialNow = specialDayNow(now, env.GREETING_PREVIEW_DATE);
  const firstName = getFirstName(contact.name);
  // Os contatos não têm aniversário cadastrado: no portal, comemora o da empresa (a fundação do cliente).
  const years = companyAnniversaryYears(client.foundedOn, specialNow);
  const holiday = getHoliday(specialNow);
  return (
    <PortalUserMenu
      contact={{ name: contact.name, email: contact.email, imageUrl: resolveMediaUrl(contact.image) }}
      client={{ name: client.name, logoUrl: resolveMediaUrl(client.logoKey) }}
      firstName={firstName}
      greeting={getGreeting(now)}
      special={
        years
          ? { kind: "birthday", text: `Parabéns pelos ${years} ${years === 1 ? "ano" : "anos"} de ${client.name}!` }
          : holiday
            ? { kind: "holiday", holiday, text: getHolidayGreeting(holiday, firstName, specialNow) }
            : null
      }
    />
  );
}
