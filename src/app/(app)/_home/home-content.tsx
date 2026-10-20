import {
  CalendarCheckIcon,
  CakeIcon,
  ChartColumnIcon,
  InboxIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
  SunsetIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { EmptyLine, HomeCard, Stat } from "@/components/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { birthdayOccurrences, formatDay, WEEKDAYS } from "@/lib/calendar";
import { REQUEST_STATUSES, requestCode } from "@/lib/client-requests";
import { dayKey, formatDate } from "@/lib/format";
import { getFirstName, getGreeting, isBirthdayToday } from "@/lib/greeting";
import { splitMentions, todayInSaoPaulo } from "@/lib/jobs";
import { messageEffectOf, messageEffectText } from "@/lib/messages";
import { excerpt } from "@/lib/notifications";
import { addDays, dayDiff, formatDays, STALLED_AFTER_DAYS } from "@/lib/reports";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listBirthdays } from "@/server/calendar";
import { listConversations } from "@/server/chat";
import { listRequestsOverview } from "@/server/client-requests";
import { listRecentActivity, listUnreadJobThreads } from "@/server/home";
import { findUserNames, listTeamMembers } from "@/server/jobs";
import { resolveMediaUrl } from "@/server/media";
import { isOpen, isOverdueNow, loadReportJobs, stalledJobs, type ReportJob } from "@/server/reports";
import { messagePreview } from "../chat/present";
import { BarList } from "../relatorios/report-ui";
import { HomeRefresher } from "./home-refresher";
import { RequestsSection } from "./requests-section";
import {
  ActivityFeed,
  AgendaList,
  BirthdayList,
  OverdueBadge,
  WaitingList,
  WeekStrip,
  type AgendaEntry,
  type BirthdayEntry,
  type WaitingItem,
  type WeekDay,
} from "./sections";

const WEEK_DAYS = 7;
const AGENDA_LIMIT = 10;
const WAITING_LIMIT = 8;
const TEAM_LIMIT = 8;
const STALLED_LIMIT = 5;
const ACTIVITY_DAYS = 7;

const GREETING_ICONS: Record<string, LucideIcon> = { "Bom dia": SunIcon, "Boa tarde": SunsetIcon, "Boa noite": MoonIcon };

/** "a", "a e b", "a, b e c" */
function joinPt(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Domingo da semana de `day` (a semana começa no domingo, como no calendário). */
function weekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -weekday);
}

// "Meu dia": o que a pessoa precisa ver ao abrir o sistema. Admins ganham, no
// fim, as solicitações dos clientes e a visão da agência inteira.
export async function HomeContent() {
  const { user } = await requireSession();
  const isAdmin = user.role === "admin";
  const now = new Date();
  const today = todayInSaoPaulo(now);
  const weekEnd = addDays(today, WEEK_DAYS - 1);

  const [jobs, threads, conversations, activity, birthdays, team, requests] = await Promise.all([
    // Admins: todos (a seção da agência usa); os demais, só os seus.
    loadReportJobs(db, isAdmin ? {} : { assigneeId: user.id }),
    listUnreadJobThreads(db, user.id),
    listConversations(db, user.id),
    listRecentActivity(db, user.id, new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000)),
    listBirthdays(db),
    isAdmin ? listTeamMembers(db) : Promise.resolve([]),
    // A tela de solicitações é só dos admins.
    isAdmin ? listRequestsOverview(db, { kind: "team", userId: user.id, since: user.createdAt }) : Promise.resolve([]),
  ]);
  const mine = isAdmin ? jobs.filter((item) => item.assignees.some((person) => person.id === user.id)) : jobs;
  const open = mine.filter(isOpen);

  // Números e agenda pessoais
  const overdue = open.filter((item) => isOverdueNow(item, today));
  const dueToday = open.filter((item) => item.dueDate === today);
  const soon = open.filter((item) => item.dueDate && item.dueDate > today && item.dueDate <= addDays(today, WEEK_DAYS));
  const sinceSunday = weekStart(today);
  const concludedThisWeek = mine.filter((item) => item.status.isFinal && dayKey(item.statusChangedAt) >= sinceSunday);
  const agenda: AgendaEntry[] = [
    ...overdue
      .map((job) => ({ job, when: "overdue" as const, days: dayDiff(job.dueDate!, today) }))
      .sort((a, b) => b.days - a.days),
    ...dueToday.map((job) => ({ job, when: "today" as const, days: 0 })),
    ...soon
      .map((job) => ({ job, when: "soon" as const, days: dayDiff(today, job.dueDate!) }))
      .sort((a, b) => a.days - b.days),
  ];

  // Precisa de resposta: menções primeiro, depois o mais recente.
  const names = await findUserNames(
    db,
    threads.flatMap((thread) => splitMentions(thread.lastBody).flatMap((part) => (part.type === "mention" ? [part.userId] : []))),
  );
  // A última mensagem: o efeito ("☕ mandou um café"), o texto com as menções ou, só com anexos, o aviso.
  const threadText = (body: string) => {
    const effect = messageEffectOf(body);
    if (effect) return messageEffectText(effect);
    const text = splitMentions(body)
      .map((part) => (part.type === "mention" ? `@${names.get(part.userId) ?? "alguém"}` : part.text))
      .join("");
    return excerpt(text, 90) || "Enviou um arquivo";
  };
  const waiting: WaitingItem[] = [
    ...threads
      .sort((a, b) => Number(b.mentioned) - Number(a.mentioned) || b.lastAt.getTime() - a.lastAt.getTime())
      .map((thread) => ({
        kind: "job" as const,
        key: `job:${thread.jobId}`,
        href: `/trabalhos/${thread.pit}#mensagens`,
        title: `#${thread.pit} ${thread.name}`,
        preview: `${thread.lastAuthor}${thread.mentioned ? " mencionou você" : ""}: ${threadText(thread.lastBody)}`,
        count: thread.unread,
        mentioned: thread.mentioned,
      })),
    // Mensagens não lidas nas solicitações (de quem escreveu por último; do cliente, com o nome dele).
    ...requests
      .filter((request) => request.unread > 0)
      .map((request) => ({
        kind: "request" as const,
        key: `request:${request.id}`,
        href: `/solicitacoes/${request.number}#mensagens`,
        title: `${requestCode(request.number)} ${request.title}`,
        preview: `${request.lastMessage.authorName ?? "Alguém"}${request.lastMessage.authorSide === "client" ? ` (${request.client.name})` : ""}: ${excerpt(request.lastMessage.body ?? "", 90) || "Enviou um arquivo"}`,
        count: request.unread,
        client: { name: request.client.name, logoUrl: resolveMediaUrl(request.client.logoKey) },
      })),
    ...conversations
      .filter((conversation) => conversation.unread > 0)
      .map((conversation) => ({
        kind: "chat" as const,
        key: `chat:${conversation.id}`,
        href: `/chat/${conversation.id}`,
        title: conversation.other?.name ?? "Conversa",
        imageUrl: resolveMediaUrl(conversation.other?.image),
        preview: conversation.lastMessage
          ? messagePreview(conversation.lastMessage.body, conversation.lastMessage.attachments)
          : "",
        count: conversation.unread,
      })),
  ];

  // Semana em tira e aniversários
  const week: WeekDay[] = Array.from({ length: WEEK_DAYS }, (_, index) => {
    const date = addDays(today, index);
    return {
      date,
      weekday: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()],
      day: String(Number(date.slice(8))),
      deliveries: open.filter((item) => item.dueDate === date).length,
      birthdays: birthdays.filter((person) => birthdayOccurrences(person.birthday, date, date).length > 0).length,
      isToday: index === 0,
    };
  });
  const birthdayEntries: BirthdayEntry[] = birthdays
    .flatMap((person) =>
      birthdayOccurrences(person.birthday, today, weekEnd).map((date) => ({
        id: person.id,
        name: person.name,
        imageUrl: resolveMediaUrl(person.image),
        date,
        isToday: date === today,
        isViewer: person.id === user.id,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pt-BR"));

  // Saudação e resumo
  const greeting = getGreeting(now);
  const birthday = isBirthdayToday(user.birthday, now);
  const GreetingIcon = birthday ? CakeIcon : (GREETING_ICONS[greeting] ?? SunIcon);
  const newRequests = requests.filter((request) => request.isNew && !REQUEST_STATUSES[request.status].closed).length;
  const summaryParts = [
    dueToday.length > 0 && plural(dueToday.length, "entrega", "entregas"),
    newRequests > 0 && plural(newRequests, "solicitação nova de cliente", "solicitações novas de clientes"),
    overdue.length > 0 && plural(overdue.length, "trabalho atrasado", "trabalhos atrasados"),
    waiting.length > 0 && plural(waiting.length, "conversa esperando resposta", "conversas esperando resposta"),
  ].filter((part): part is string => Boolean(part));
  const summary =
    summaryParts.length > 0
      ? `Hoje você tem ${joinPt(summaryParts)}.`
      : open.length > 0
        ? "Nada vencendo hoje, nada atrasado e nenhuma conversa esperando. Bom momento para adiantar o que vem por aí."
        : "Você não está em nenhum trabalho em aberto agora.";

  return (
    <div className="flex flex-col gap-8">
      <HomeRefresher />
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{formatDay(today)}</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              birthday ? "bg-primary-soft text-primary-ink" : "bg-muted text-muted-foreground",
            )}
          >
            <GreetingIcon className="size-5" />
          </span>
          {birthday ? `Feliz aniversário, ${getFirstName(user.name)}!` : `${greeting}, ${getFirstName(user.name)}!`}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{summary}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em aberto" value={open.length} detail="seus trabalhos" />
        <Stat label="Entregas hoje" value={dueToday.length} detail={formatDate(now)} />
        <Stat label="Atrasados" value={overdue.length} detail="entrega já passou" tone={overdue.length > 0 ? "bad" : undefined} />
        <Stat
          label="Concluídos"
          value={concludedThisWeek.length}
          detail="nesta semana"
          tone={concludedThisWeek.length > 0 ? "good" : undefined}
        />
      </div>

      <WeekStrip days={week} />

      <div className="grid gap-6 lg:grid-cols-3">
        <HomeCard title="Minha agenda de entregas" action={{ label: "Ver calendário", href: "/calendario" }} className="lg:col-span-2">
          {agenda.length === 0 ? (
            <EmptyLine icon={CalendarCheckIcon}>Nenhuma entrega atrasada nem para os próximos 7 dias.</EmptyLine>
          ) : (
            <>
              <AgendaList entries={agenda.slice(0, AGENDA_LIMIT)} />
              {agenda.length > AGENDA_LIMIT && (
                <Link href="/minha-planilha" className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                  e mais {agenda.length - AGENDA_LIMIT} na Minha planilha
                </Link>
              )}
            </>
          )}
        </HomeCard>

        <HomeCard title="Precisa de resposta" action={waiting.length > 0 ? { label: "Abrir chat", href: "/chat" } : undefined}>
          {waiting.length === 0 ? (
            <EmptyLine icon={InboxIcon}>Nenhuma mensagem esperando você.</EmptyLine>
          ) : (
            <WaitingList items={waiting.slice(0, WAITING_LIMIT)} />
          )}
        </HomeCard>

        <HomeCard title="Atividade recente" className="lg:col-span-2">
          {activity.length === 0 ? (
            <EmptyLine icon={SparklesIcon}>Nada mudou nos seus trabalhos nos últimos 7 dias.</EmptyLine>
          ) : (
            <ActivityFeed items={activity} now={now} />
          )}
        </HomeCard>

        <HomeCard title="Aniversariantes da semana" action={{ label: "Ver calendário", href: "/calendario" }}>
          {birthdayEntries.length === 0 ? (
            <EmptyLine icon={CakeIcon}>Ninguém faz aniversário nos próximos 7 dias.</EmptyLine>
          ) : (
            <BirthdayList entries={birthdayEntries} />
          )}
        </HomeCard>
      </div>

      {isAdmin && <RequestsSection rows={requests} today={today} />}
      {isAdmin && <AgencySection jobs={jobs} team={team} today={today} now={now} />}
    </div>
  );
}

/** Só admins: a agência inteira, a carga da equipe e o que está parado. */
function AgencySection({
  jobs,
  team,
  today,
  now,
}: {
  jobs: ReportJob[];
  team: { id: string; name: string; image: string | null }[];
  today: string;
  now: Date;
}) {
  const open = jobs.filter(isOpen);
  const overdue = open.filter((item) => isOverdueNow(item, today));
  const thisWeek = open.filter((item) => item.dueDate && item.dueDate >= today && item.dueDate <= addDays(today, WEEK_DAYS - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const concludedThisMonth = jobs.filter((item) => item.status.isFinal && dayKey(item.statusChangedAt) >= monthStart);
  const load = team
    .map((person) => {
      const theirs = open.filter((item) => item.assignees.some((assignee) => assignee.id === person.id));
      return { person, open: theirs.length, overdue: theirs.filter((item) => isOverdueNow(item, today)).length };
    })
    .filter((row) => row.open > 0)
    .sort((a, b) => b.open - a.open || b.overdue - a.overdue)
    .slice(0, TEAM_LIMIT);
  const stalled = stalledJobs(jobs, now).slice(0, STALLED_LIMIT);

  return (
    <section aria-labelledby="agencia" className="flex flex-col gap-4 border-t pt-8">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="agencia" className="text-base font-semibold">
            Agência
          </h2>
          <p className="text-sm text-muted-foreground">Todos os trabalhos, de toda a equipe.</p>
        </div>
        <Link
          href="/relatorios"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          <ChartColumnIcon className="size-4" />
          Relatórios
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em aberto" value={open.length} detail="na agência" />
        <Stat label="Atrasados" value={overdue.length} detail="na agência" tone={overdue.length > 0 ? "bad" : undefined} />
        <Stat label="Entregas da semana" value={thisWeek.length} detail="próximos 7 dias" />
        <Stat label="Concluídos" value={concludedThisMonth.length} detail="neste mês" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HomeCard title="Carga da equipe" action={{ label: "Ver relatório", href: "/relatorios?aba=equipe" }}>
          <p className="-mt-1 text-xs text-muted-foreground">Trabalhos em aberto de cada pessoa (e quantos estão atrasados).</p>
          <BarList
            empty="Ninguém com trabalho em aberto."
            items={load.map((row) => ({
              key: row.person.id,
              label: (
                <span className="flex items-center gap-2">
                  {row.person.name}
                  <OverdueBadge count={row.overdue} />
                </span>
              ),
              value: row.open,
              href: `/minha-planilha?pessoa=${row.person.id}`,
            }))}
          />
        </HomeCard>

        <HomeCard title={`Parados há ${STALLED_AFTER_DAYS} dias ou mais`} action={{ label: "Ver todos", href: "/relatorios?aba=etapas" }}>
          {stalled.length === 0 ? (
            <EmptyLine icon={SparklesIcon}>Nenhum trabalho parado. Tudo andando.</EmptyLine>
          ) : (
            <ul className="flex flex-col divide-y">
              {stalled.map(({ job, days }) => (
                <li key={job.id}>
                  <Link
                    href={`/trabalhos/${job.pit}`}
                    className="flex items-center justify-between gap-3 py-2.5 outline-none hover:bg-muted/30 focus-visible:bg-muted/40"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        <span className="text-muted-foreground tabular-nums">#{job.pit}</span> {job.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {job.client.name} · em {job.status.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-warning-ink tabular-nums">
                      há {formatDays(Math.floor(days))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </HomeCard>
      </div>
    </section>
  );
}

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
