import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { ACHIEVEMENT_IDS, achievementOf } from "@/lib/achievements";
import { formatDate } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { listUnlockedIds } from "@/server/achievements/core";
import { listAchievementPeople, loadAchievementBoard } from "@/server/achievements/page";
import { resolveMediaUrl } from "@/server/media";
import { AchievementsView } from "./achievements-view";

export const metadata: Metadata = { title: "Conquistas" };

// Conquistas (catálogo em src/lib/achievements.ts): as próprias e as de cada
// pessoa da equipe (?pessoa=). Secretas só aparecem para quem já desbloqueou
// cada uma; para os outros, "Conquista secreta". Admins concedem as manuais.
export default function ConquistasPage({ searchParams }: PageProps<"/conquistas">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AchievementsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AchievementsContent({ searchParams }: { searchParams: PageProps<"/conquistas">["searchParams"] }) {
  const { user } = await requireSession();
  const { pessoa } = await searchParams;
  const people = await listAchievementPeople(db);
  // Pessoa desconhecida ou desativada: as próprias conquistas.
  const owner = people.find((person) => person.id === pessoa) ?? people.find((person) => person.id === user.id);
  const ownerId = owner?.id ?? user.id;
  const viewingOther = ownerId !== user.id;

  const [board, viewerUnlocked] = await Promise.all([
    loadAchievementBoard(db, { userId: ownerId, isAdmin: owner?.role === "admin" }),
    viewingOther ? listUnlockedIds(db, user.id) : null,
  ]);
  // Secreta que quem vê ainda não desbloqueou fica escondida (mesmo na página de outra pessoa).
  const seen = viewerUnlocked ?? new Set(board.unlocked.keys());
  const cards = ACHIEVEMENT_IDS.map((id) => {
    const unlocked = board.unlocked.get(id);
    return {
      id,
      hidden: Boolean(achievementOf(id).secret) && !seen.has(id),
      unlockedOn: unlocked ? formatDate(unlocked.unlockedAt) : null,
      grantedByName: unlocked?.grantedByName ?? null,
      progress: board.progress.get(id) ?? null,
      team: board.teamCounts.get(id) ?? 0,
    };
  });
  const name = owner?.name ?? user.name;

  return (
    <AchievementsView
      title={viewingOther ? `Conquistas de ${name.split(" ")[0]}` : "Conquistas"}
      people={people.map((person) => ({
        id: person.id,
        name: person.name,
        imageUrl: resolveMediaUrl(person.image),
        unlocked: person.unlocked,
      }))}
      selectedId={ownerId}
      viewerId={user.id}
      owner={{ id: ownerId, name, imageUrl: resolveMediaUrl(owner?.image ?? user.image) }}
      cards={cards}
      teamSize={people.length}
      canGrant={user.role === "admin"}
    />
  );
}
