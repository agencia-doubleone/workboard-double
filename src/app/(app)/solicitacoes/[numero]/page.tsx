import { ArrowLeftIcon, ClockAlertIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ClientLogo } from "@/components/client-logo";
import { toDeliveryView, toRequestMessageView, toRequestTimeline } from "@/components/requests/present";
import { RequestConversation } from "@/components/requests/request-conversation";
import { RequestDeliveries } from "@/components/requests/request-deliveries";
import { RequestTabs } from "@/components/requests/request-tabs";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { RichTextContent } from "@/components/rich-text-editor";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { isRequestOverdue, parseRequestNumber, REQUEST_STATUSES, requestCode } from "@/lib/client-requests";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { todayInSaoPaulo } from "@/lib/jobs";
import { requireAdmin } from "@/lib/session";
import {
  findClientRequestByNumber,
  getClientRequestLastRead,
  listClientRequestEvents,
  listClientRequestMessages,
  listClientRequestStatusHistory,
} from "@/server/client-requests";
import { listJobsOfRequest } from "@/server/jobs";
import { isMediaConfigured, resolveMediaUrl } from "@/server/media";
import { listRequestDeliveries } from "@/server/request-deliveries";
import {
  deleteRequestMessage,
  discardRequestAttachment,
  markRequestRead,
  removeOldDeliveryFiles,
  sendRequestMessage,
  withdrawDelivery,
} from "../actions";
import { RequestStatusSelect } from "../request-status-select";
import { ExpectedOnField } from "./expected-on-field";
import { RequestActions } from "./request-actions";
import { RequestJobsCard } from "./request-jobs-card";
import { SendDeliveryButton } from "./send-delivery-button";

export const metadata: Metadata = { title: "Solicitação" };

export default function SolicitacaoPage({ params }: PageProps<"/solicitacoes/[numero]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequestContent params={params} />
    </Suspense>
  );
}

async function RequestContent({ params }: { params: PageProps<"/solicitacoes/[numero]">["params"] }) {
  const { user } = await requireAdmin();
  const number = parseRequestNumber((await params).numero);
  const found = number ? await findClientRequestByNumber(db, number) : null;
  if (!found) notFound();
  const { request, client } = found;
  const viewer = { kind: "team" as const, userId: user.id, since: user.createdAt };

  const [messages, history, events, lastReadAt, deliveries, jobs] = await Promise.all([
    listClientRequestMessages(db, request.id),
    listClientRequestStatusHistory(db, request.id),
    listClientRequestEvents(db, request.id),
    getClientRequestLastRead(db, request.id, viewer),
    listRequestDeliveries(db, request.id),
    listJobsOfRequest(db, request.id),
  ]);
  const pendingRound = deliveries.find((delivery) => delivery.status === "pending")?.round ?? null;
  const now = new Date();
  const code = requestCode(request.number);
  const closed = REQUEST_STATUSES[request.status].closed;
  const today = todayInSaoPaulo(now);
  const overdue = isRequestOverdue(request.expectedOn, request.status, today);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={closed ? "/solicitacoes?situacao=encerradas" : "/solicitacoes"}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ArrowLeftIcon className="size-4" />
        Solicitações
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
              {code}
            </span>
            {overdue && request.expectedOn && (
              <Badge variant="destructive">
                <ClockAlertIcon data-icon="inline-start" />
                Atrasada desde {formatCalendarDate(request.expectedOn)}
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">{request.title}</h1>
          <Link
            href={`/clientes/${client.slug}`}
            className="flex w-fit min-w-0 items-center gap-2 text-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
          >
            <ClientLogo name={client.name} logoUrl={resolveMediaUrl(client.logoKey)} className="size-6 text-[9px]" />
            <span className="truncate">{client.name}</span>
          </Link>
        </div>
        <RequestActions request={{ id: request.id, number: request.number, title: request.title }} />
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Briefing</CardTitle>
              <CardDescription>
                {request.createdBySide === "client"
                  ? "Como o cliente descreveu o pedido."
                  : "Cadastrado pela equipe, em nome do cliente."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {request.briefing ? (
                <RichTextContent html={request.briefing} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  Sem briefing. Use “Editar” para escrever.
                </p>
              )}
            </CardContent>
          </Card>

          <RequestTabs
            defaultTab="conversa"
            deliveryCount={deliveries.length}
            messageCount={messages.length}
            actions={
              <SendDeliveryButton
                requestId={request.id}
                code={code}
                nextRound={(deliveries[0]?.round ?? 0) + 1}
                pendingRound={pendingRound}
                closedLabel={closed ? REQUEST_STATUSES[request.status].label : null}
                uploadsEnabled={isMediaConfigured()}
              />
            }
            deliveries={
              <RequestDeliveries
                deliveries={deliveries.map((delivery) => toDeliveryView(delivery, { side: "team" }))}
                side="team"
                withdraw={withdrawDelivery}
                removeOldFiles={removeOldDeliveryFiles}
                emptyText="Mande os arquivos para o cliente aprovar no portal: ele responde cada um, aprovando ou pedindo alteração."
              />
            }
            conversation={
              <RequestConversation
                requestId={request.id}
                messages={messages.map((message) => toRequestMessageView(message, { kind: "team", userId: user.id }, now))}
                lastReadAt={lastReadAt.toISOString()}
                uploadsEnabled={isMediaConfigured()}
                via="team"
                actions={{
                  send: sendRequestMessage,
                  remove: deleteRequestMessage,
                  discard: discardRequestAttachment,
                  markRead: markRequestRead,
                }}
                sideLabels={{ client: "Cliente" }}
                emptyText="O cliente vê tudo o que for escrito aqui, no portal. Combine detalhes, peça material e mande arquivos."
                pageHref={`/solicitacoes/${request.number}`}
              />
            }
          />
        </div>

        {/* No celular, os detalhes (status, previsão) vêm antes do briefing e da conversa. */}
        <aside className="order-first flex flex-col gap-6 xl:sticky xl:top-6 xl:order-none">
          <Card>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
              <CardDescription>O cliente vê o status e a previsão no portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <DetailItem label="Status">
                  <RequestStatusSelect
                    requestId={request.id}
                    requestLabel={`${code} ${request.title}`}
                    value={request.status}
                    className="-mr-1"
                  />
                </DetailItem>
                <DetailItem label="Previsão de entrega">
                  <ExpectedOnField requestId={request.id} value={request.expectedOn} overdue={overdue} />
                </DetailItem>
                <DetailItem label="Aberta em">
                  <span className="text-right">
                    {formatDateTime(request.createdAt)}
                    <span className="block text-xs text-muted-foreground">
                      por {request.createdByName}, {request.createdBySide === "client" ? "pelo portal" : "pela equipe"}
                    </span>
                  </span>
                </DetailItem>
              </dl>
            </CardContent>
          </Card>

          <RequestJobsCard requestNumber={request.number} jobs={jobs} today={today} />

          <Card>
            <CardHeader>
              <CardTitle>Andamento</CardTitle>
              <CardDescription>Status, previsão de entrega e edições, com quem fez. O cliente vê o mesmo no portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTimeline items={toRequestTimeline(history, events)} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
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
