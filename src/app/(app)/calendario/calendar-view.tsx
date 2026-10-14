"use client";

import { CakeIcon, CalendarDaysIcon, CalendarHeartIcon, ClockAlertIcon, PartyPopperIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ClientLogo } from "@/components/client-logo";
import { Hint } from "@/components/hint";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/user-avatar";
import { WEEKDAYS } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { AssigneeAvatars } from "../trabalhos/job-widgets";
import type { CalendarBirthday, CalendarClientDate, CalendarDay, CalendarItem, CalendarJob } from "./types";

/** Quantos itens cabem numa célula da grade; o resto vira "+N". */
const ITEMS_PER_CELL = 3;

export function CalendarView({ days, emptyText }: { days: CalendarDay[]; emptyText: string }) {
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [open, setOpen] = useState(false);

  function openDay(day: CalendarDay) {
    setSelected(day);
    setOpen(true);
  }

  const agenda = days.filter((day) => day.inMonth && day.items.length > 0);

  return (
    <>
      {/* Tela grande: o mês em grade. */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-raised md:block">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-2 py-2 text-xs font-medium text-muted-foreground">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
          {days.map((day) => (
            <DayCell key={day.date} day={day} onOpen={() => openDay(day)} />
          ))}
        </div>
      </div>

      {/* Celular: só os dias do mês que têm alguma coisa, em lista. */}
      <div className="flex flex-col gap-4 md:hidden">
        {agenda.length === 0 ? (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDaysIcon />
              </EmptyMedia>
              <EmptyTitle>Nada neste mês</EmptyTitle>
              <EmptyDescription>{emptyText}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          agenda.map((day) => (
            <section key={day.date} className="flex flex-col gap-2">
              <h3
                className={cn(
                  "text-xs font-semibold text-muted-foreground first-letter:uppercase",
                  day.isToday && "text-primary-ink",
                )}
              >
                {day.isToday ? `Hoje, ${day.shortTitle}` : day.shortTitle}
              </h3>
              <ItemList items={day.items} />
            </section>
          ))
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle className="first-letter:uppercase">{selected.title}</SheetTitle>
                <SheetDescription>
                  {selected.items.length === 0 ? "Nada marcado neste dia." : describeCount(selected.items)}
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto p-4">
                {selected.items.length > 0 ? (
                  <ItemList items={selected.items} onNavigate={() => setOpen(false)} />
                ) : (
                  <p className="text-sm text-muted-foreground">Dia livre.</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function describeCount(items: CalendarItem[]) {
  const jobs = items.filter((item) => item.kind === "job").length;
  const birthdays = items.filter((item) => item.kind === "birthday").length;
  const clientDates = items.filter((item) => item.kind === "client").length;
  return [
    jobs > 0 && `${jobs} ${jobs === 1 ? "entrega" : "entregas"}`,
    birthdays > 0 && `${birthdays} ${birthdays === 1 ? "aniversário" : "aniversários"}`,
    clientDates > 0 && `${clientDates} ${clientDates === 1 ? "data de cliente" : "datas de clientes"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DayCell({ day, onOpen }: { day: CalendarDay; onOpen: () => void }) {
  const shown = day.items.slice(0, ITEMS_PER_CELL);
  const hidden = day.items.length - shown.length;
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group/day flex min-h-30 cursor-pointer flex-col gap-1 border-r border-b p-1.5 transition-colors hover:bg-muted/40",
        !day.inMonth && "bg-muted/20 text-muted-foreground",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`${day.title}${day.items.length > 0 ? `: ${describeCount(day.items)}` : ""}`}
        className={cn(
          "flex size-6 items-center justify-center self-start rounded-full text-xs font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          day.isToday ? "bg-primary text-primary-foreground" : day.inMonth ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {day.label}
      </button>
      <ul className={cn("flex min-w-0 flex-col gap-0.5", !day.inMonth && "opacity-60")}>
        {shown.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="min-w-0">
            {item.kind === "job" ? (
              <JobChip job={item} />
            ) : item.kind === "client" ? (
              <ClientDateChip occasion={item} />
            ) : (
              <BirthdayChip person={item} />
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="self-start rounded px-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          +{hidden} {hidden === 1 ? "outro" : "outros"}
        </button>
      )}
    </div>
  );
}

/** Trabalho na grade: nas cores do status; atrasado ganha borda e relógio; encerrado fica apagado. */
function JobChip({ job }: { job: CalendarJob }) {
  return (
    <Hint
      label={
        <span className="flex flex-col gap-0.5">
          <span>
            #{job.pit} {job.name}
          </span>
          <span className="font-normal opacity-80">
            {job.clientName} · {job.status.name}
            {job.overdue && " · atrasado"}
          </span>
        </span>
      }
    >
      <Link
        href={`/trabalhos/${job.pit}`}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "flex h-5 min-w-0 items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50",
          job.overdue && "ring-1 ring-destructive ring-inset",
          job.done && "line-through opacity-55",
        )}
        // Cores do cadastro do status (não seguem o tema, como no selo).
        style={{ color: job.status.textColor, backgroundColor: job.status.backgroundColor }}
      >
        {job.overdue && <ClockAlertIcon aria-label="Atrasado" className="size-3 shrink-0" />}
        <span className="shrink-0 tabular-nums">#{job.pit}</span>
        <span className="truncate">{job.name}</span>
      </Link>
    </Hint>
  );
}

function BirthdayChip({ person }: { person: CalendarBirthday }) {
  const firstName = person.name.split(" ")[0];
  return (
    <Hint label={person.isViewer ? "Seu aniversário 🎉" : `Aniversário de ${person.name}`}>
      <span className="flex h-5 min-w-0 items-center gap-1 rounded-[5px] bg-primary-soft px-1.5 text-xs font-medium text-primary-ink">
        <CakeIcon className="size-3 shrink-0" />
        <span className="truncate">{person.isViewer ? "Seu aniversário" : firstName}</span>
      </span>
    </Hint>
  );
}

/** "Aniversário da empresa · 12 anos" ou só o nome da data. */
function occasionText(occasion: CalendarClientDate) {
  return occasion.age ? `${occasion.label} · ${occasion.age}` : occasion.label;
}

/** Data de cliente na grade: neutra, com o nome do cliente; leva à página dele. */
function ClientDateChip({ occasion }: { occasion: CalendarClientDate }) {
  const Icon = occasion.founding ? PartyPopperIcon : CalendarHeartIcon;
  return (
    <Hint
      label={
        <span className="flex flex-col gap-0.5">
          <span>{occasion.clientName}</span>
          <span className="font-normal opacity-80">{occasionText(occasion)}</span>
        </span>
      }
    >
      <Link
        href={`/clientes/${occasion.clientSlug}`}
        onClick={(event) => event.stopPropagation()}
        className="flex h-5 min-w-0 items-center gap-1 rounded-[5px] bg-muted px-1.5 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {occasion.clientName} · {occasion.age ?? occasion.label}
        </span>
      </Link>
    </Hint>
  );
}

/** Lista completa de um dia (painel lateral e agenda do celular). */
function ItemList({ items, onNavigate }: { items: CalendarItem[]; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) =>
        item.kind === "client" ? (
          <li key={`client:${item.id}`}>
            <Link
              href={`/clientes/${item.clientSlug}`}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-raised outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ClientLogo name={item.clientName} logoUrl={item.clientLogoUrl} className="size-8 text-[10px]" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{item.clientName}</span>
                <span className="text-xs text-muted-foreground">{occasionText(item)}</span>
              </div>
              {item.founding ? (
                <PartyPopperIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <CalendarHeartIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
            </Link>
          </li>
        ) : item.kind === "birthday" ? (
          <li key={`birthday:${item.id}`} className="flex items-center gap-3 rounded-lg bg-primary-soft px-3 py-2.5">
            <UserAvatar name={item.name} imageUrl={item.imageUrl} className="size-8" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{item.isViewer ? "Seu aniversário!" : item.name}</span>
              <span className="text-xs text-primary-ink">{item.isViewer ? "Parabéns 🎉" : "Faz aniversário"}</span>
            </div>
            <CakeIcon className="size-4 shrink-0 text-primary-ink" />
          </li>
        ) : (
          <li key={`job:${item.id}`}>
            <Link
              href={`/trabalhos/${item.pit}`}
              onClick={onNavigate}
              className={cn(
                "flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-raised outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
                item.done && "opacity-70",
              )}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ClientLogo name={item.clientName} logoUrl={item.clientLogoUrl} className="size-5 text-[8px]" />
                  <span className="truncate">{item.clientName}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">#{item.pit}</span>
              </div>
              <span className={cn("text-sm leading-snug font-medium", item.done && "line-through")}>{item.name}</span>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <JobStatusBadge
                    name={item.status.name}
                    textColor={item.status.textColor}
                    backgroundColor={item.status.backgroundColor}
                  />
                  {item.overdue && (
                    <Badge variant="destructive">
                      <ClockAlertIcon data-icon="inline-start" />
                      Atrasado
                    </Badge>
                  )}
                </span>
                {item.assignees.length > 0 && <AssigneeAvatars people={item.assignees} showName={false} />}
              </div>
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
