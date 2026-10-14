import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  MusicIcon,
  PinIcon,
  SmartphoneIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { FacebookIcon, InstagramIcon, LinkedinIcon, YoutubeIcon } from "@/components/brand-icons";
import { Hint } from "@/components/hint";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatMonth, shiftMonth, type MonthKey } from "@/lib/calendar";
import { PLANNING_STATUSES, SOCIAL_NETWORKS, type PlanningStatus, type PostKind, type SocialNetwork } from "@/lib/planning";
import { cn } from "@/lib/utils";

// Peças pequenas dos planejamentos, usadas na lista e na página do cliente.

export function PlanningStatusBadge({ status, className }: { status: PlanningStatus; className?: string }) {
  const definition = PLANNING_STATUSES[status];
  return (
    <Badge variant={definition.badge} className={className}>
      {definition.label}
    </Badge>
  );
}

const NETWORK_ICONS: Record<SocialNetwork, React.ComponentType<{ className?: string }>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  linkedin: LinkedinIcon,
  youtube: YoutubeIcon,
  tiktok: MusicIcon,
  pinterest: PinIcon,
};

export function NetworkIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const Icon = NETWORK_ICONS[network];
  return <Icon className={cn("size-3.5", className)} aria-label={SOCIAL_NETWORKS[network]} />;
}

export const KIND_ICONS: Record<PostKind, LucideIcon> = {
  estatico: ImageIcon,
  carrossel: GalleryHorizontalIcon,
  reels: ClapperboardIcon,
  stories: SmartphoneIcon,
  video: VideoIcon,
};

/** Setas de mês anterior/próximo e o nome do mês (links: o mês fica na URL). */
export function MonthNav({ month, hrefFor, current }: { month: MonthKey; hrefFor: (month: MonthKey) => string; current: MonthKey }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Hint label="Mês anterior">
          <Link href={hrefFor(shiftMonth(month, -1))} aria-label="Mês anterior" scroll={false} className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronLeftIcon />
          </Link>
        </Hint>
        <Hint label="Próximo mês">
          <Link href={hrefFor(shiftMonth(month, 1))} aria-label="Próximo mês" scroll={false} className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronRightIcon />
          </Link>
        </Hint>
        {month !== current && (
          <Link href={hrefFor(current)} scroll={false} className={buttonVariants({ variant: "outline" })}>
            Mês atual
          </Link>
        )}
      </div>
      <h2 className="px-1 text-lg font-semibold tracking-tight first-letter:uppercase">{formatMonth(month)}</h2>
    </div>
  );
}

/** Barra de progresso de posts aprovados no mês (com a meta, quando há). */
export function ApprovalProgress({ approved, total, goal }: { approved: number; total: number; goal: number | null }) {
  const base = Math.max(total, goal ?? 0, 1);
  const missing = goal !== null ? goal - total : 0;
  return (
    <Hint
      label={
        <span className="flex flex-col">
          <span>
            {approved} de {total} {total === 1 ? "post aprovado" : "posts aprovados"}
          </span>
          {goal !== null && (
            <span className="font-normal opacity-80">
              Meta de {goal} {goal === 1 ? "post" : "posts"}
              {missing > 0 ? ` · ${missing === 1 ? "falta 1" : `faltam ${missing}`}` : " · atingida"}
            </span>
          )}
        </span>
      }
    >
      <div className="flex min-w-36 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium tabular-nums">
            {approved}/{total} aprovados
          </span>
          {goal !== null && (
            <span className={cn("tabular-nums", total < goal ? "text-warning-ink" : "text-muted-foreground")}>meta {goal}</span>
          )}
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${(total / base) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(approved / base) * 100}%` }} />
        </div>
      </div>
    </Hint>
  );
}
