import {
  AtSignIcon,
  CakeIcon,
  CircleCheckIcon,
  ClockAlertIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ClientLogo } from "@/components/client-logo";
import { JobStatusBadge } from "@/components/job-status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { formatCompactDay, formatShortDay } from "@/lib/calendar";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/home";
import { resolveMediaUrl } from "@/server/media";
import type { ReportJob } from "@/server/reports";

// Partes da tela de Início (componentes de servidor; os dados chegam prontos de home-content.tsx).

export function HomeCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-raised", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="text-xs font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyLine({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" />
      {children}
    </p>
  );
}

export type WeekDay = { date: string; weekday: string; day: string; deliveries: number; birthdays: number; isToday: boolean };

/** Os próximos 7 dias, com quantas entregas (e aniversários) cada um tem. */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <nav aria-label="Próximos 7 dias" className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((day) => (
        <Link
          key={day.date}
          href={`/calendario?mes=${day.date.slice(0, 7)}`}
          aria-label={`${formatShortDay(day.date)}: ${day.deliveries} ${day.deliveries === 1 ? "entrega" : "entregas"}${day.birthdays ? `, ${day.birthdays} aniversário` : ""}`}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border bg-card px-1 py-2.5 shadow-raised outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
            day.isToday && "border-primary/50 bg-primary-soft hover:bg-primary-soft",
          )}
        >
          <span className={cn("text-[11px] font-medium text-muted-foreground uppercase", day.isToday && "text-primary-ink")}>
            {day.isToday ? "Hoje" : day.weekday}
          </span>
          <span className="text-lg font-semibold tabular-nums">{day.day}</span>
          <span className="flex h-4 items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
            {day.deliveries > 0 ? (
              <span className={cn("rounded-full bg-muted px-1.5 font-medium text-foreground", day.isToday && "bg-primary text-primary-foreground")}>
                {day.deliveries}
              </span>
            ) : (
              "—"
            )}
            {day.birthdays > 0 && <CakeIcon aria-hidden="true" className="size-3 text-primary-ink" />}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export type AgendaEntry = { job: ReportJob; when: "overdue" | "today" | "soon"; days: number };

/** Atrasados, de hoje e dos próximos dias (só os trabalhos da pessoa). */
export function AgendaList({ entries }: { entries: AgendaEntry[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {entries.map(({ job, when, days }) => (
        <li key={job.id}>
          <Link
            href={`/trabalhos/${job.pit}`}
            className="flex items-center gap-3 py-2.5 outline-none hover:bg-muted/30 focus-visible:bg-muted/40"
          >
            <span
              className={cn(
                "flex w-20 shrink-0 flex-col text-xs leading-tight tabular-nums",
                when === "overdue" ? "text-destructive-ink" : when === "today" ? "text-warning-ink" : "text-muted-foreground",
              )}
            >
              <span className="font-semibold">
                {when === "overdue" ? `${days} ${days === 1 ? "dia" : "dias"}` : when === "today" ? "Hoje" : formatCompactDay(job.dueDate!)}
              </span>
              <span>{when === "overdue" ? "de atraso" : when === "today" ? "vence hoje" : `em ${days} ${days === 1 ? "dia" : "dias"}`}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                <span className="text-muted-foreground tabular-nums">#{job.pit}</span> {job.name}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <ClientLogo name={job.client.name} logoUrl={resolveMediaUrl(job.client.logoKey)} className="size-4 text-[7px]" />
                <span className="truncate">{job.client.name}</span>
              </span>
            </span>
            <JobStatusBadge
              name={job.status.name}
              textColor={job.status.textColor}
              backgroundColor={job.status.backgroundColor}
              className="hidden shrink-0 sm:inline-flex"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type WaitingItem =
  | { kind: "job"; key: string; href: string; title: string; preview: string; count: number; mentioned: boolean }
  | {
      kind: "chat";
      key: string;
      href: string;
      title: string;
      imageUrl: string | null;
      preview: string;
      count: number;
    };

/** Menções, mensagens novas nos trabalhos e conversas do chat não lidas. */
export function WaitingList({ items }: { items: WaitingItem[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
          >
            {item.kind === "chat" ? (
              <UserAvatar name={item.title} imageUrl={item.imageUrl} className="size-8" />
            ) : (
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  item.mentioned ? "bg-primary-soft text-primary-ink" : "bg-muted text-muted-foreground",
                )}
              >
                {item.mentioned ? <AtSignIcon className="size-4" /> : <MessageSquareIcon className="size-4" />}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{item.title}</span>
              <span
                className={cn(
                  "truncate text-xs text-muted-foreground",
                  item.kind === "job" && item.mentioned && "text-primary-ink",
                )}
              >
                {item.preview}
              </span>
            </span>
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const ACTIVITY_ICONS: Record<ActivityItem["kind"], LucideIcon> = {
  status: CircleCheckIcon,
  messages: MessagesSquareIcon,
  assigned: UserPlusIcon,
};

/** O que outras pessoas fizeram nos trabalhos da pessoa nos últimos dias. */
export function ActivityFeed({ items, now }: { items: ActivityItem[]; now: Date }) {
  return (
    <ol className="flex flex-col">
      {items.map((item, index) => {
        const Icon = ACTIVITY_ICONS[item.kind];
        const job = (
          <Link href={`/trabalhos/${item.pit}`} className="font-medium text-foreground outline-none hover:underline focus-visible:underline">
            #{item.pit} {item.jobName}
          </Link>
        );
        const who = <span className="font-medium text-foreground">{item.actorName ?? "Alguém"}</span>;
        let text: React.ReactNode;
        if (item.kind === "assigned") {
          text = <>{who} incluiu você em {job}</>;
        } else if (item.kind === "messages") {
          text =
            item.authors > 1 ? (
              <>
                {who} e mais {item.authors - 1} {item.authors === 2 ? "pessoa" : "pessoas"} mandaram {item.count} mensagens em{" "}
                {job}
              </>
            ) : item.count > 1 ? (
              <>
                {who} mandou {item.count} mensagens em {job}
              </>
            ) : (
              <>
                {who} escreveu em {job}
              </>
            );
        } else if (item.created) {
          text = <>{who} cadastrou {job}</>;
        } else {
          text = (
            <>
              {who} mudou {job} para{" "}
              <JobStatusBadge
                name={item.status.name}
                textColor={item.status.textColor}
                backgroundColor={item.status.backgroundColor}
                className="h-5 px-1.5 align-middle text-[11px]"
              />
            </>
          );
        }
        return (
          <li key={`${item.kind}:${item.pit}:${item.at.getTime()}:${index}`} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Linha do tempo: o traço liga um item ao próximo. */}
            {index < items.length - 1 && (
              <span aria-hidden="true" className="absolute top-7 bottom-0 left-3.5 w-px bg-border" />
            )}
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-1">
              <p className="text-sm leading-snug text-muted-foreground">{text}</p>
              <span className="text-xs text-muted-foreground/80">{formatRelative(item.at, now)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type BirthdayEntry = { id: string; name: string; imageUrl: string | null; date: string; isToday: boolean; isViewer: boolean };

export function BirthdayList({ entries }: { entries: BirthdayEntry[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-1.5",
            entry.isToday && "bg-primary-soft",
          )}
        >
          <UserAvatar name={entry.name} imageUrl={entry.imageUrl} className="size-8" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{entry.isViewer ? "Você" : entry.name}</span>
            <span className={cn("text-xs first-letter:uppercase", entry.isToday ? "font-medium text-primary-ink" : "text-muted-foreground")}>
              {entry.isToday ? "Hoje! 🎉" : formatShortDay(entry.date)}
            </span>
          </span>
          <CakeIcon className={cn("size-4 shrink-0", entry.isToday ? "text-primary-ink" : "text-muted-foreground")} />
        </li>
      ))}
    </ul>
  );
}

export function OverdueBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-destructive-ink">
      <ClockAlertIcon className="size-3.5" />
      {count} {count === 1 ? "atrasado" : "atrasados"}
    </span>
  );
}
