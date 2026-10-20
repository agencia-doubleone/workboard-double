import { ArrowLeftIcon, CalendarClockIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { toDeliveryView, toRequestMessageView, toRequestTimeline } from "@/components/requests/present";
import { RequestConversation } from "@/components/requests/request-conversation";
import { RequestDeliveries } from "@/components/requests/request-deliveries";
import { RequestTabs } from "@/components/requests/request-tabs";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { RichTextContent } from "@/components/rich-text-editor";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { canClientCancel, isRequestOverdue, parseRequestNumber, REQUEST_STATUSES, requestCode } from "@/lib/client-requests";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { todayInSaoPaulo } from "@/lib/jobs";
import { PORTAL_REQUESTS_PATH } from "@/lib/portal";
import { requirePortalSession } from "@/lib/portal-session";
import {
  findClientRequestByNumber,
  getClientRequestLastRead,
  listClientRequestEvents,
  listClientRequestMessages,
  listClientRequestStatusHistory,
} from "@/server/client-requests";
import { isMediaConfigured } from "@/server/media";
import { listRequestDeliveries } from "@/server/request-deliveries";
import {
  decideDeliveryFile,
  deletePortalRequestMessage,
  discardPortalRequestAttachment,
  markPortalRequestRead,
  sendPortalRequestMessage,
  submitDeliveryAnswer,
} from "../actions";
import { CancelRequestButton } from "./cancel-request-button";

export const metadata: Metadata = { title: "Solicitação" };

export default function PortalRequestPage({ params }: PageProps<"/portal/solicitacoes/[numero]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequestContent params={params} />
    </Suspense>
  );
}

async function RequestContent({ params }: { params: PageProps<"/portal/solicitacoes/[numero]">["params"] }) {
  const { contact, client } = await requirePortalSession();
  const number = parseRequestNumber((await params).numero);
  // Só as do cliente do contato: a de outro cliente "não existe", mesmo acertando o número.
  const found = number ? await findClientRequestByNumber(db, number, { clientId: client.id }) : null;
  if (!found) notFound();
  const { request } = found;
  const viewer = { kind: "portal" as const, portalUserId: contact.id, clientId: client.id, since: contact.createdAt };

  const [messages, history, events, lastReadAt, deliveries] = await Promise.all([
    listClientRequestMessages(db, request.id),
    listClientRequestStatusHistory(db, request.id),
    listClientRequestEvents(db, request.id),
    getClientRequestLastRead(db, request.id, viewer),
    listRequestDeliveries(db, request.id),
  ]);
  // Uma rodada esperando resposta: a página abre nas entregas.
  const pending = deliveries.some((delivery) => delivery.status === "pending");
  const now = new Date();
  const overdue = isRequestOverdue(request.expectedOn, request.status, todayInSaoPaulo(now));
  const code = requestCode(request.number);
  const closed = REQUEST_STATUSES[request.status].closed;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={closed ? `${PORTAL_REQUESTS_PATH}?situacao=encerradas` : PORTAL_REQUESTS_PATH}
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
            <RequestStatusBadge status={request.status} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">{request.title}</h1>
        </div>
        {canClientCancel(request.status) && <CancelRequestButton requestId={request.id} code={code} />}
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Briefing</CardTitle>
            </CardHeader>
            <CardContent>
              {request.briefing ? (
                <RichTextContent html={request.briefing} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  Sem briefing. Combine os detalhes com a equipe pela conversa.
                </p>
              )}
            </CardContent>
          </Card>

          <RequestTabs
            defaultTab={pending ? "entregas" : "conversa"}
            deliveryCount={deliveries.length}
            messageCount={messages.length}
            attention={pending && contact.canApprove ? "Para aprovar" : undefined}
            deliveries={
              <RequestDeliveries
                deliveries={deliveries.map((delivery) => toDeliveryView(delivery, { side: "portal" }))}
                side="portal"
                canAnswer={contact.canApprove}
                answer={{ decide: decideDeliveryFile, submit: submitDeliveryAnswer }}
                emptyText="Quando a Double One mandar arquivos para você aprovar, eles aparecem aqui: aprove cada um ou peça alterações."
              />
            }
            conversation={
              <RequestConversation
                requestId={request.id}
                messages={messages.map((message) => toRequestMessageView(message, { kind: "portal", portalUserId: contact.id }, now))}
                lastReadAt={lastReadAt.toISOString()}
                uploadsEnabled={isMediaConfigured()}
                via="portal"
                actions={{
                  send: sendPortalRequestMessage,
                  remove: deletePortalRequestMessage,
                  discard: discardPortalRequestAttachment,
                  markRead: markPortalRequestRead,
                }}
                sideLabels={{ team: "Double One" }}
                emptyText="Tire dúvidas, mande material e acompanhe a conversa com a equipe da Double One por aqui."
              />
            }
          />
        </div>

        {/* No celular, os detalhes (status, previsão) vêm antes do briefing e da conversa. */}
        <aside className="order-first flex flex-col gap-6 xl:sticky xl:top-6 xl:order-none">
          <Card>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <DetailItem label="Status">
                  <RequestStatusBadge status={request.status} />
                </DetailItem>
                <DetailItem label="Previsão de entrega">
                  {request.expectedOn ? (
                    <span className={overdue ? "flex items-center gap-1.5 font-medium text-destructive-ink" : "flex items-center gap-1.5 font-medium"}>
                      <CalendarClockIcon className={overdue ? "size-4" : "size-4 text-muted-foreground"} />
                      {formatCalendarDate(request.expectedOn)}
                      {overdue && <span className="sr-only"> (atrasada)</span>}
                    </span>
                  ) : (
                    <span className="text-right text-muted-foreground">A Double One ainda vai informar</span>
                  )}
                </DetailItem>
                <DetailItem label="Aberta em">
                  <span className="text-right">
                    {formatDateTime(request.createdAt)}
                    <span className="block text-xs text-muted-foreground">
                      por {request.createdByName}
                      {request.createdBySide === "team" ? " (Double One)" : ""}
                    </span>
                  </span>
                </DetailItem>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Andamento</CardTitle>
              <CardDescription>Status, previsão de entrega e mudanças, da mais recente para a mais antiga.</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTimeline items={toRequestTimeline(history, events)} teamLabel="Double One" />
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
