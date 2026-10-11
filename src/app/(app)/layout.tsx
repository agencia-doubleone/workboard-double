import { Suspense } from "react";

import { GlobalSearch } from "@/components/search/global-search";
import { AppShell } from "@/components/shell/app-shell";
import { NavSection } from "@/components/shell/app-sidebar";
import { UserMenu, UserMenuSkeleton } from "@/components/shell/user-menu";
import { env } from "@/env";
import { getFirstName, getGreeting, getHoliday, getHolidayGreeting, isBirthdayToday } from "@/lib/greeting";
import { getSession, requireSession } from "@/lib/session";
import { resolveMediaUrl } from "@/server/media";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      adminNav={
        <Suspense>
          <AdminNav />
        </Suspense>
      }
      userMenu={
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenuLoader />
        </Suspense>
      }
      search={
        // Enquanto a sessão carrega, a busca já aparece (só sem as páginas de admin).
        <Suspense fallback={<GlobalSearch isAdmin={false} />}>
          <SearchLoader />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

async function SearchLoader() {
  const session = await getSession();
  return <GlobalSearch isAdmin={session?.user.role === "admin"} />;
}

async function AdminNav() {
  const session = await getSession();
  return session?.user.role === "admin" ? <NavSection id="admin" /> : null;
}

async function UserMenuLoader() {
  const { user } = await requireSession();
  const now = new Date();
  const firstName = getFirstName(user.name);
  // Em desenvolvimento, GREETING_PREVIEW_DATE (.env.local) finge outra data para conferir as datas especiais.
  const holidayNow =
    process.env.NODE_ENV === "development" && env.GREETING_PREVIEW_DATE
      ? new Date(`${env.GREETING_PREVIEW_DATE}T15:00:00Z`)
      : now;
  const holiday = getHoliday(holidayNow);
  return (
    <UserMenu
      user={{
        name: user.name,
        email: user.email,
        role: user.role ?? "user",
        imageUrl: resolveMediaUrl(user.image),
      }}
      firstName={firstName}
      greeting={getGreeting(now)}
      isBirthday={isBirthdayToday(user.birthday, now)}
      holiday={holiday ? { id: holiday, greeting: getHolidayGreeting(holiday, firstName, holidayNow) } : null}
    />
  );
}
