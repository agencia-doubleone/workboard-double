import { UsersIcon } from "lucide-react";

import { AchievementBadge, RARITY_TEXT } from "@/components/achievements/achievement-badge";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatar } from "@/components/user-avatar";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  achievementOf,
  type AchievementCategory,
  type AchievementId,
  type AchievementRarity,
} from "@/lib/achievements";
import { cn } from "@/lib/utils";
import { ManualAchievementButton } from "./manual-achievement-button";
import { PeopleTabs, type AchievementPersonTab } from "./people-tabs";

/** Uma conquista como quem vê enxerga (secreta escondida, data já formatada). */
export type AchievementCardView = {
  id: AchievementId;
  /** Secreta que quem vê ainda não desbloqueou. */
  hidden: boolean;
  /** "10/10/2026" (null: bloqueada). */
  unlockedOn: string | null;
  grantedByName: string | null;
  progress: { current: number; goal: number; unit?: string } | null;
  /** Quantas pessoas da equipe têm. */
  team: number;
};

type AchievementsViewProps = {
  title: string;
  people: AchievementPersonTab[];
  selectedId: string;
  viewerId: string;
  owner: { id: string; name: string; imageUrl: string | null };
  cards: AchievementCardView[];
  teamSize: number;
  /** Admins concedem as conquistas manuais. */
  canGrant: boolean;
};

const RARITY_ORDER = Object.keys(ACHIEVEMENT_RARITIES) as AchievementRarity[];
const CATEGORY_ORDER = Object.keys(ACHIEVEMENT_CATEGORIES) as AchievementCategory[];

export function AchievementsView({ title, people, selectedId, viewerId, owner, cards, teamSize, canGrant }: AchievementsViewProps) {
  const total = cards.length;
  const unlockedCount = cards.filter((card) => card.unlockedOn).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description="Elas aparecem com o uso do Workboard no dia a dia. Algumas são secretas." />
      <PeopleTabs people={people} selectedId={selectedId} viewerId={viewerId} />

      <section
        aria-label="Resumo"
        className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-raised sm:flex-row sm:items-center sm:gap-6"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <UserAvatar name={owner.name} imageUrl={owner.imageUrl} className="size-12 text-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">{unlockedCount}</span>
              <span className="text-muted-foreground"> de {total} conquistas</span>
            </p>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Conquistas desbloqueadas"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={unlockedCount}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${(unlockedCount / total) * 100}%` }} />
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-4 gap-x-5 gap-y-2 text-sm">
          {RARITY_ORDER.map((rarity) => {
            const ofRarity = cards.filter((card) => achievementOf(card.id).rarity === rarity);
            return (
              <div key={rarity} className="flex flex-col">
                <dt className={cn("text-xs font-medium", RARITY_TEXT[rarity])}>{ACHIEVEMENT_RARITIES[rarity].label}</dt>
                <dd className="tabular-nums">
                  <span className="font-semibold">{ofRarity.filter((card) => card.unlockedOn).length}</span>
                  <span className="text-muted-foreground"> / {ofRarity.length}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const inCategory = cards.filter((card) => achievementOf(card.id).category === category);
        return (
          <section key={category} aria-labelledby={`categoria-${category}`} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`categoria-${category}`} className="text-base font-semibold tracking-tight">
                {ACHIEVEMENT_CATEGORIES[category].label}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {inCategory.filter((card) => card.unlockedOn).length} de {inCategory.length}
              </span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {inCategory.map((card) => (
                <AchievementCard
                  key={card.id}
                  card={card}
                  teamSize={teamSize}
                  owner={owner}
                  canGrant={canGrant && Boolean(achievementOf(card.id).manual)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AchievementCard({
  card,
  teamSize,
  owner,
  canGrant,
}: {
  card: AchievementCardView;
  teamSize: number;
  owner: { id: string; name: string };
  canGrant: boolean;
}) {
  const definition = achievementOf(card.id);
  const { hidden, progress } = card;
  return (
    <li
      id={card.id}
      className="flex scroll-mt-6 gap-3.5 rounded-xl border bg-card p-4 shadow-raised target:border-primary/60 target:ring-2 target:ring-primary/25"
    >
      <AchievementBadge id={card.id} size={56} locked={!card.unlockedOn} hidden={hidden} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm leading-snug font-medium">{hidden ? "Conquista secreta" : definition.name}</h3>
          <span className={cn("shrink-0 text-xs font-medium", hidden ? "text-muted-foreground" : RARITY_TEXT[definition.rarity])}>
            {hidden ? "???" : ACHIEVEMENT_RARITIES[definition.rarity].label}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {hidden ? "Continue explorando o Workboard para descobrir." : definition.description}
        </p>
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {card.unlockedOn ? (
            <p className="text-xs font-medium text-success-ink">
              Desbloqueada em {card.unlockedOn}
              {card.grantedByName && <span className="font-normal text-muted-foreground"> · por {card.grantedByName}</span>}
            </p>
          ) : progress ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(progress.current / progress.goal) * 100}%` }} />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {progress.current.toLocaleString("pt-BR")} / {progress.goal.toLocaleString("pt-BR")}
                {progress.unit ? ` ${progress.unit}` : ""}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Bloqueada</p>
          )}
          <div className="flex min-h-6 items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <UsersIcon aria-hidden="true" className="size-3.5" />
              {card.team === 0 ? "Ninguém tem ainda" : `${card.team} de ${teamSize} ${teamSize === 1 ? "pessoa" : "pessoas"}`}
            </p>
            {canGrant && (
              <ManualAchievementButton
                userId={owner.id}
                personName={owner.name}
                achievementId={card.id}
                achievementName={definition.name}
                granted={Boolean(card.unlockedOn)}
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
