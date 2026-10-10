import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import {
  birthdayOccurrences,
  formatDay,
  formatMonth,
  formatShortDay,
  isMonthKey,
  monthGrid,
  monthOf,
  shiftMonth,
  type MonthKey,
} from "@/lib/calendar";
import { isOverdue, todayInSaoPaulo } from "@/lib/jobs";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listBirthdays, listJobsDue } from "@/server/calendar";
import { resolveMediaUrl } from "@/server/media";
import { toPersonView } from "../trabalhos/present";
import { CalendarView } from "./calendar-view";
import type { CalendarDay, CalendarItem } from "./types";

export const metadata: Metadata = { title: "Calendário" };

type CalendarParams = {
  month: MonthKey;
  /** "todos": inclui os concluídos e inativos. */
  all: boolean;
  /** Admins: só os próprios trabalhos (os demais sempre veem só os seus). */
  mine: boolean;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function calendarHref(params: CalendarParams, today: string) {
  const query = new URLSearchParams();
  if (params.month !== monthOf(today)) query.set("mes", params.month);
  if (params.all) query.set("situacao", "todos");
  if (params.mine) query.set("quem", "meus");
  const qs = query.toString();
  return qs ? `/calendario?${qs}` : "/calendario";
}

// Mês em grade com as entregas de cada dia (data de entrega dos trabalhos) e os
// aniversários da equipe. Quem não é admin vê só os trabalhos em que está.
export default function CalendarioPage({ searchParams }: PageProps<"/calendario">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarContent({ searchParams }: { searchParams: PageProps<"/calendario">["searchParams"] }) {
  const { user } = await requireSession();
  const isAdmin = user.role === "admin";
  const raw = await searchParams;
  const today = todayInSaoPaulo();
  const requested = first(raw.mes);
  const params: CalendarParams = {
    month: isMonthKey(requested) ? requested : monthOf(today),
    all: first(raw.situacao) === "todos",
    mine: !isAdmin || first(raw.quem) === "meus",
  };

  const { days, from, to } = monthGrid(params.month);
  const [jobs, birthdays] = await Promise.all([
    listJobsDue(db, { from, to, assigneeId: params.mine ? user.id : undefined, openOnly: !params.all }),
    listBirthdays(db),
  ]);

  const itemsByDay = new Map<string, CalendarItem[]>();
  const add = (day: string, item: CalendarItem) => itemsByDay.set(day, [...(itemsByDay.get(day) ?? []), item]);
  for (const person of birthdays) {
    for (const day of birthdayOccurrences(person.birthday, from, to)) {
      add(day, {
        kind: "birthday",
        id: person.id,
        name: person.name,
        imageUrl: resolveMediaUrl(person.image),
        isViewer: person.id === user.id,
      });
    }
  }
  for (const job of jobs) {
    add(job.dueDate, {
      kind: "job",
      id: job.id,
      pit: job.pit,
      name: job.name,
      clientName: job.client.name,
      clientLogoUrl: resolveMediaUrl(job.client.logoKey),
      status: { name: job.status.name, textColor: job.status.textColor, backgroundColor: job.status.backgroundColor },
      done: job.status.isFinal || !job.active,
      overdue: job.active && isOverdue(job.dueDate, job.status.isFinal, today),
      assignees: job.assignees.map(toPersonView),
    });
  }

  const calendarDays: CalendarDay[] = days.map((date) => ({
    date,
    label: String(Number(date.slice(8))),
    title: formatDay(date),
    shortTitle: formatShortDay(date),
    inMonth: monthOf(date) === params.month,
    isToday: date === today,
    items: itemsByDay.get(date) ?? [],
  }));

  const monthJobs = jobs.filter((job) => monthOf(job.dueDate) === params.month);
  const overdue = monthJobs.filter((job) => job.active && isOverdue(job.dueDate, job.status.isFinal, today)).length;
  const isCurrentMonth = params.month === monthOf(today);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendário"
        description={
          params.mine
            ? "As entregas dos seus trabalhos e os aniversários da equipe, dia a dia."
            : "As entregas de todos os trabalhos e os aniversários da equipe, dia a dia."
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Link
              href={calendarHref({ ...params, month: shiftMonth(params.month, -1) }, today)}
              aria-label="Mês anterior"
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <ChevronLeftIcon />
            </Link>
            <Link
              href={calendarHref({ ...params, month: shiftMonth(params.month, 1) }, today)}
              aria-label="Próximo mês"
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <ChevronRightIcon />
            </Link>
            {!isCurrentMonth && (
              <Link
                href={calendarHref({ ...params, month: monthOf(today) }, today)}
                className={buttonVariants({ variant: "outline" })}
              >
                Hoje
              </Link>
            )}
          </div>
          <h2 className="px-1 text-lg font-semibold tracking-tight first-letter:uppercase">
            {formatMonth(params.month)}
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {monthJobs.length} {monthJobs.length === 1 ? "entrega" : "entregas"}
            {overdue > 0 && <span className="text-destructive-ink"> · {overdue} {overdue === 1 ? "atrasada" : "atrasadas"}</span>}
          </span>

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Segments
              label="Situação"
              options={[
                { label: "Em aberto", href: calendarHref({ ...params, all: false }, today), current: !params.all },
                { label: "Todos", href: calendarHref({ ...params, all: true }, today), current: params.all },
              ]}
            />
            {isAdmin && (
              <Segments
                label="De quem"
                options={[
                  { label: "Equipe", href: calendarHref({ ...params, mine: false }, today), current: !params.mine },
                  { label: "Só os meus", href: calendarHref({ ...params, mine: true }, today), current: params.mine },
                ]}
              />
            )}
          </div>
        </div>

        <CalendarView
          days={calendarDays}
          emptyText={
            params.all
              ? "Nenhuma entrega nem aniversário neste mês."
              : "Nenhuma entrega em aberto nem aniversário neste mês."
          }
        />
      </div>
    </div>
  );
}

const segmentClass =
  "flex h-8 items-center rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=true]:bg-background aria-[current=true]:text-foreground aria-[current=true]:shadow-control dark:aria-[current=true]:bg-input/50";

function Segments({ label, options }: { label: string; options: { label: string; href: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          aria-current={option.current ? "true" : undefined}
          scroll={false}
          className={cn(segmentClass)}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
