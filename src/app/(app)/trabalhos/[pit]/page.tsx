import { BanIcon, CircleOffIcon, ClockAlertIcon, FileTextIcon, InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AchievementPing } from "@/components/achievements/achievement-ping";
import { ClientLogo } from "@/components/client-logo";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { RichTextContent } from "@/components/rich-text-editor";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { db } from "@/db";
import { requestCode, type RequestStatus } from "@/lib/client-requests";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { extractMentions, isDoneStatus, isOverdue, todayInSaoPaulo } from "@/lib/jobs";
import { requireSession } from "@/lib/session";
import { findClientRequestById } from "@/server/client-requests";
import {
  findJobByPit,
  findUserNames,
  getJobLastRead,
  listJobMessages,
  listJobStatuses,
  listJobStatusHistory,
  listMentionableIds,
  listTeamMembers,
} from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { listMessageExtras, listPinnedMessages } from "@/server/messages";
import { listJobWhiteboards } from "@/server/whiteboards";
import { JobWhiteboards } from "../../quadros/job-whiteboards";
import { toCardView, toPersonView as toBoardPersonView } from "../../quadros/present";
import { JobBackLink } from "../job-list-memory";
import { ActiveSwitch, StatusTimeline } from "../job-widgets";
import { canSeeJob, parsePit, toMessageView, toPersonView, toPinnedMessageView, toStatusOption } from "../present";
import { StatusSelect } from "../status-select";
import { JobActions } from "./job-actions";
import { JobMessages } from "./job-messages";

export const metadata: Metadata = { title: "Trabalho" };

export default function TrabalhoPage({ params }: PageProps<"/trabalhos/[pit]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobContent params={params} />
    </Suspense>
  );
}

async function JobContent({ params }: { params: PageProps<"/trabalhos/[pit]">["params"] }) {
  const { user } = await requireSession();
  const isAdmin = user.role === "admin";
  const pit = parsePit((await params).pit);
  const found = pit ? await findJobByPit(db, pit) : null;
  // Quem não é admin só vê os trabalhos em que está vinculado; os outros "não existem".
  if (!found || !canSeeJob(found, user)) notFound();
  const { job, client, status, assignees } = found;

  const [statuses, history, messages, mentionableIds, lastReadAt, boards, team, pinned, source] = await Promise.all([
    listJobStatuses(db),
    listJobStatusHistory(db, job.id),
    listJobMessages(db, job.id),
    listMentionableIds(db, job.id),
    getJobLastRead(db, job.id, user.id),
    listJobWhiteboards(db, job.id, { id: user.id, isAdmin }),
    listTeamMembers(db),
    listPinnedMessages(db, "job", job.id),
    job.clientRequestId ? findClientRequestById(db, job.clientRequestId) : null,
  ]);
  const extras = await listMessageExtras(db, "job", messages.map((message) => message.id), user.id);
  // Só dá para @mencionar os funcionários ativos do trabalho.
  const mentionable = assignees.filter((person) => mentionableIds.includes(person.id));
  // Nomes de quem foi mencionado (mesmo desativado) e de quem cadastrou.
  const names = await findUserNames(db, [
    ...messages.flatMap((message) => extractMentions(message.body)),
    ...(job.createdById ? [job.createdById] : []),
  ]);
  const now = new Date();
  const overdue = isOverdue(job.dueDate, status.isFinal, todayInSaoPaulo(now));
  const creatorName = job.createdById ? names.get(job.createdById) : null;
  // Concluído há mais de um ano: abrir conta para a conquista "De Volta ao Passado".
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const longFinished = isDoneStatus(status) && job.statusChangedAt <= yearAgo;
  // Sem lista lembrada nesta aba (JobBackLink), o voltar padrão: a lista geral é só dos admins; a equipe
  // volta para a própria planilha (cancelado: para o recorte deles).
  const backHref = `${isAdmin ? "/trabalhos" : "/minha-planilha"}${status.isCanceled ? "?situacao=cancelados" : ""}`;

  return (
    <div className="flex flex-col gap-6">
      {longFinished && <AchievementPing event={{ type: "job.visit", jobId: job.id }} />}
      <JobBackLink fallback={{ href: backHref, label: isAdmin ? "Trabalhos" : "Minha planilha" }} isAdmin={isAdmin} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
              PIT {job.pit}
            </span>
            {status.isCanceled && (
              <Badge variant="destructive">
                <BanIcon data-icon="inline-start" />
                Cancelado
              </Badge>
            )}
            {!job.active && (
              <Badge variant="outline">
                <CircleOffIcon data-icon="inline-start" />
                Inativo
              </Badge>
            )}
            {overdue && (
              <Badge variant="destructive">
                <ClockAlertIcon data-icon="inline-start" />
                Atrasado
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">{job.name}</h1>
          <Link
            href={`/clientes/${client.slug}`}
            className="flex w-fit min-w-0 items-center gap-2 text-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
          >
            <ClientLogo name={client.name} logoUrl={resolveMediaUrl(client.logoKey)} className="size-6 text-[9px]" />
            <span className="truncate">{client.name}</span>
          </Link>
        </div>
        <JobActions job={{ id: job.id, pit: job.pit, name: job.name }} isAdmin={isAdmin} />
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Briefing</CardTitle>
            </CardHeader>
            <CardContent>
              {job.briefing ? (
                <RichTextContent html={job.briefing} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  Sem briefing. Use “Editar” para escrever.
                </p>
              )}
            </CardContent>
          </Card>

          <section id="mensagens" className="flex scroll-mt-6 flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Mensagens</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {messages.length} {messages.length === 1 ? "mensagem" : "mensagens"}
              </span>
            </div>
            <JobMessages
              jobId={job.id}
              messages={messages.map((message) => toMessageView(message, { viewerId: user.id, isAdmin, names, now, extras }))}
              pinned={pinned.map((message) => toPinnedMessageView(message, names))}
              people={mentionable.map(toPersonView)}
              viewerId={user.id}
              lastReadAt={lastReadAt?.toISOString() ?? null}
              uploadsEnabled={isMediaConfigured()}
            />
          </section>
        </div>

        {/* No celular, os detalhes (status, entrega) vêm antes do briefing e da conversa. */}
        <aside className="order-first flex flex-col gap-6 xl:sticky xl:top-6 xl:order-none">
          <Card>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <DetailItem label="Status">
                  <StatusSelect
                    jobId={job.id}
                    jobLabel={`#${job.pit} ${job.name}`}
                    value={status.id}
                    statuses={statuses.map(toStatusOption)}
                    isAdmin={isAdmin}
                    className="-ml-1"
                  />
                </DetailItem>
                <DetailItem label="Entrega">
                  {job.dueDate ? (
                    <span className={overdue ? "font-medium text-destructive-ink" : "font-medium"}>
                      {formatCalendarDate(job.dueDate)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sem data</span>
                  )}
                </DetailItem>
                <DetailItem label="Ativo">
                  <span className="flex items-center gap-2">
                    <ActiveSwitch
                      jobId={job.id}
                      active={job.active}
                      label={job.active ? "Desativar trabalho" : "Ativar trabalho"}
                    />
                    <span className="text-muted-foreground">{job.active ? "Sim" : "Não"}</span>
                  </span>
                </DetailItem>
                <div className="flex flex-col gap-2">
                  <dt className="text-xs text-muted-foreground">Funcionários</dt>
                  <dd>
                    {assignees.length === 0 ? (
                      <span className="text-muted-foreground">Ninguém ainda</span>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {assignees.map((person) => (
                          <li key={person.id} className="flex min-w-0 items-center gap-2">
                            <UserAvatar
                              name={person.name}
                              imageUrl={resolveMediaUrl(person.image)}
                              className="size-6 text-[10px]"
                            />
                            <span className="truncate">{person.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {source && (
                  <DetailItem label="Solicitação">
                    <SourceRequest request={source.request} linked={isAdmin} />
                  </DetailItem>
                )}
                <DetailItem label="Lançamento">
                  <span className="text-right">
                    {formatDateTime(job.createdAt)}
                    {creatorName && <span className="block text-xs text-muted-foreground">por {creatorName}</span>}
                  </span>
                </DetailItem>
              </dl>
            </CardContent>
          </Card>

          <JobWhiteboards
            boards={boards.map((board) => toCardView(board, now, { id: user.id, isAdmin }))}
            job={{ id: job.id, pit: job.pit, name: job.name }}
            people={team.filter((person) => person.id !== user.id).map(toBoardPersonView)}
          />

          <Card>
            <CardHeader>
              <CardTitle>Histórico de status</CardTitle>
              <CardDescription>Cada troca, com quem trocou e quando.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusTimeline
                items={history.map((row) => ({
                  id: row.id,
                  statusName: row.statusName,
                  textColor: row.textColor,
                  backgroundColor: row.backgroundColor,
                  changedByName: row.changedByName,
                  changedAt: row.changedAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/**
 * A solicitação do cliente de onde o trabalho saiu. A tela de solicitações é só
 * dos admins: para o resto da equipe, só o número e o assunto.
 */
function SourceRequest({
  request,
  linked,
}: {
  request: { number: number; title: string; status: RequestStatus };
  linked: boolean;
}) {
  const label = (
    <>
      <InboxIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium tabular-nums">{requestCode(request.number)}</span>
      <span className="truncate text-muted-foreground">{request.title}</span>
    </>
  );
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      {linked ? (
        <Link
          href={`/solicitacoes/${request.number}`}
          className="flex max-w-full min-w-0 items-center gap-1.5 outline-none hover:underline focus-visible:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="flex max-w-full min-w-0 items-center gap-1.5">{label}</span>
      )}
      <RequestStatusBadge status={request.status} />
    </span>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 justify-end">{children}</dd>
    </div>
  );
}
