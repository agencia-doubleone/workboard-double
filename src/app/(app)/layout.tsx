import { Suspense } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { NavSection } from "@/components/shell/app-sidebar";
import { UserMenu, UserMenuSkeleton } from "@/components/shell/user-menu";
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
    >
      {children}
    </AppShell>
  );
}

async function AdminNav() {
  const session = await getSession();
  return session?.user.role === "admin" ? <NavSection id="admin" /> : null;
}

async function UserMenuLoader() {
  const { user } = await requireSession();
  return (
    <UserMenu
      user={{
        name: user.name,
        email: user.email,
        role: user.role ?? "user",
        imageUrl: resolveMediaUrl(user.image),
      }}
    />
  );
}
