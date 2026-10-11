import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { Hint } from "@/components/hint";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { ACHIEVEMENT_IDS, achievementOf } from "@/lib/achievements";
import { requireSession } from "@/lib/session";
import { listRecentAchievements } from "@/server/achievements/page";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { ProfileForm, ProfileFormSkeleton } from "./profile-form";

export const metadata: Metadata = { title: "Meu perfil" };

// Título e textos das seções aparecem na hora; só os cards esperam a sessão,
// que é lida dentro do <Suspense> (Cache Components).
export default function PerfilPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Meu perfil"
        description="Seu nome e sua foto aparecem para a equipe no Workboard."
      />
      <Suspense fallback={<ProfileFormSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

async function ProfileContent() {
  const { user } = await requireSession();
  const achievements = await listRecentAchievements(db, user.id, RECENT_ACHIEVEMENTS);
  return (
    <div className="flex flex-col gap-8">
      <ProfileForm
        user={{
          name: user.name,
          email: user.email,
          imageUrl: resolveMediaUrl(user.image),
          birthday: user.birthday ?? null,
        }}
        uploadsEnabled={isMediaConfigured()}
      />
      <AchievementsSection {...achievements} />
    </div>
  );
}

const RECENT_ACHIEVEMENTS = 8;

/** As últimas conquistas, no mesmo formato das seções do formulário. */
function AchievementsSection({ total, recent }: Awaited<ReturnType<typeof listRecentAchievements>>) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-12 2xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Conquistas</h2>
        <p className="text-sm text-muted-foreground">As últimas que você desbloqueou usando o Workboard.</p>
      </div>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-raised sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{total}</span>
            <span className="text-muted-foreground"> de {ACHIEVEMENT_IDS.length} conquistas</span>
          </p>
          {recent.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {recent.map((item) => (
                <li key={item.id}>
                  <Hint label={achievementOf(item.id).name}>
                    <Link
                      href={`/conquistas#${item.id}`}
                      aria-label={achievementOf(item.id).name}
                      className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <AchievementBadge id={item.id} size={40} />
                    </Link>
                  </Hint>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma ainda. Elas aparecem com o uso do dia a dia.</p>
          )}
        </div>
        <Link href="/conquistas" className={buttonVariants({ variant: "outline", className: "shrink-0" })}>
          Ver todas
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </div>
    </section>
  );
}
