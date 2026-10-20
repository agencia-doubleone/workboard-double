"use client";

import { InboxIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Hint } from "@/components/hint";
import { ExpectedOnCell, MessagesCountLink } from "@/components/requests/request-cells";
import { RequestBriefingButton, RequestHistoryButton } from "@/components/requests/request-list-widgets";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import type { RequestRowView } from "@/components/requests/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestCode } from "@/lib/client-requests";
import { PORTAL_NEW_REQUEST_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";
import { cn } from "@/lib/utils";
import { getPortalRequestBriefing, getPortalRequestTimeline } from "./actions";

/** As solicitações do cliente (de todos os contatos dele), como a lista de trabalhos da equipe. */
export function PortalRequestsTable({ rows, filtered }: { rows: RequestRowView[]; filtered: boolean }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{filtered ? "Nenhuma solicitação encontrada" : "Nenhuma solicitação em aberto"}</EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Ajuste a busca ou os filtros para ver outras solicitações."
              : "Precisa de algo da Double One? Abra uma solicitação com o assunto e o briefing, e acompanhe tudo por aqui."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && (
          <EmptyContent>
            <Link href={PORTAL_NEW_REQUEST_PATH} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Nova solicitação
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Nº</TableHead>
            <TableHead className="hidden md:table-cell">Aberta em</TableHead>
            <TableHead>Assunto</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Previsão</TableHead>
            <TableHead className="hidden px-2 text-center md:table-cell">Briefing</TableHead>
            <TableHead className="px-2 text-center">Mensagens</TableHead>
            <TableHead className="hidden px-2 text-center md:table-cell">Andamento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const href = `${PORTAL_REQUESTS_PATH}/${row.number}`;
            return (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(href)}>
                <TableCell className="font-medium tabular-nums">
                  <Link
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    className="outline-none hover:underline focus-visible:underline"
                  >
                    {requestCode(row.number)}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                  <Hint label={`${row.createdAt.absolute}, por ${row.createdByName}${row.createdBySide === "team" ? " (Double One)" : ""}`}>
                    <span>{row.createdAt.date}</span>
                  </Hint>
                </TableCell>
                <TableCell className="max-w-96 min-w-40 whitespace-normal">
                  <span className="flex items-start gap-2">
                    <Link
                      href={row.pendingDelivery ? `${href}#entregas` : href}
                      onClick={(event) => event.stopPropagation()}
                      className={cn(
                        "line-clamp-2 outline-none hover:underline focus-visible:underline",
                        row.messages.unread > 0 ? "font-semibold" : "font-medium",
                      )}
                    >
                      {row.title}
                    </Link>
                    {row.pendingDelivery && (
                      <Badge variant="warning" className="mt-0.5 shrink-0">
                        Para aprovar
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <RequestStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">
                  <ExpectedOnCell value={row.expectedOn} overdue={row.overdue} />
                </TableCell>
                <TableCell className="hidden px-2 py-1.5 text-center md:table-cell">
                  <RequestBriefingButton
                    requestId={row.id}
                    title={`${requestCode(row.number)} ${row.title}`}
                    hasBriefing={row.hasBriefing}
                    load={getPortalRequestBriefing}
                  />
                </TableCell>
                <TableCell className="px-2 py-1.5 text-center">
                  <MessagesCountLink href={`${href}#mensagens`} messages={row.messages} />
                </TableCell>
                <TableCell className="hidden px-2 py-1.5 text-center md:table-cell">
                  <RequestHistoryButton requestId={row.id} load={getPortalRequestTimeline} teamLabel="Double One" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
