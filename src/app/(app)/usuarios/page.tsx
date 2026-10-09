import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { isEmailConfigured } from "@/lib/email";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { isRole } from "@/lib/users";
import { resolveMediaUrl } from "@/server/media";
import { listUsers } from "@/server/users";
import type { UserRow } from "./types";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Usuários" };

// A sessão é lida dentro do <Suspense> (Cache Components: a navegação mostra o
// esqueleto na hora). O título também fica atrás dele: para quem não é admin,
// requireAdmin() dá notFound() e a página não deve aparecer nem por um instante.
export default function UsuariosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersContent />
    </Suspense>
  );
}

async function UsersContent() {
  const { user: currentUser } = await requireAdmin();
  const users = await listUsers(db);
  const now = new Date();

  const rows: UserRow[] = users.map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    imageUrl: resolveMediaUrl(item.image),
    role: isRole(item.role) ? item.role : "user",
    active: !item.banned,
    banReason: item.banReason,
    activeSessions: item.activeSessions,
    createdAt: formatDate(item.createdAt),
    lastSignIn: item.lastSignInAt
      ? {
          relative: formatRelative(item.lastSignInAt, now),
          absolute: formatDateTime(item.lastSignInAt),
        }
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários"
        description="Quem tem acesso ao Workboard, com papel, status e sessões."
      />
      <UsersTable
        users={rows}
        currentUserId={currentUser.id}
        emailEnabled={isEmailConfigured()}
      />
    </div>
  );
}
