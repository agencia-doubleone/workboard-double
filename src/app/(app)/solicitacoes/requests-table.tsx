"use client";

import { ExternalLinkIcon, InboxIcon, LinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClientLogo } from "@/components/client-logo";
import { Hint } from "@/components/hint";
import { ExpectedOnCell, MessagesCountLink } from "@/components/requests/request-cells";
import { RequestBriefingButton, RequestHistoryButton } from "@/components/requests/request-list-widgets";
import type { RequestRowView } from "@/components/requests/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestCode } from "@/lib/client-requests";
import { cn } from "@/lib/utils";
import { getRequestBriefing, getRequestTimeline } from "./actions";
import { copyPortalRequestLink } from "./copy-portal-link";
import { DeleteRequestDialog } from "./delete-request-dialog";
import { RequestStatusSelect } from "./request-status-select";

/** Lista da equipe: como a de trabalhos, com o status mudando direto na linha e as ações no "…". */
export function RequestsTable({ rows, filtered }: { rows: RequestRowView[]; filtered: boolean }) {
  const router = useRouter();
  // Solicitação do dialog de excluir; o open separado mantém o texto durante a animação de saída.
  const [deleteTarget, setDeleteTarget] = useState<RequestRowView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
              : "Quando um cliente pedir algo pelo portal, a solicitação aparece aqui (e no sino). Pedido que chegou por fora? Use “Nova solicitação”."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Nº</TableHead>
            <TableHead className="hidden xl:table-cell">Aberta em</TableHead>
            <TableHead className="hidden sm:table-cell">Cliente</TableHead>
            <TableHead>Assunto</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Previsão</TableHead>
            <TableHead className="hidden px-2 text-center md:table-cell">Briefing</TableHead>
            <TableHead className="px-2 text-center">Mensagens</TableHead>
            <TableHead className="hidden px-2 text-center lg:table-cell">Andamento</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const href = `/solicitacoes/${row.number}`;
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
                <TableCell className="hidden text-muted-foreground tabular-nums xl:table-cell">
                  <Hint label={`${row.createdAt.absolute}, por ${row.createdByName} ${row.createdBySide === "client" ? "(portal)" : "(equipe)"}`}>
                    <span>{row.createdAt.date}</span>
                  </Hint>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="flex max-w-40 min-w-0 items-center gap-2 2xl:max-w-52">
                    <ClientLogo name={row.client.name} logoUrl={row.client.logoUrl} className="size-6 text-[9px]" />
                    <span className="truncate">{row.client.name}</span>
                  </span>
                </TableCell>
                <TableCell className="max-w-96 min-w-40 whitespace-normal">
                  <span className="flex items-start gap-2">
                    <Link
                      href={href}
                      onClick={(event) => event.stopPropagation()}
                      className={cn("line-clamp-2 outline-none hover:underline focus-visible:underline", row.isNew ? "font-semibold" : "font-medium")}
                    >
                      {row.title}
                    </Link>
                    {row.isNew && (
                      <Badge variant="default" className="mt-0.5 h-4.5 shrink-0 px-1.5 text-[10px]">
                        Nova
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground sm:hidden">{row.client.name}</span>
                </TableCell>
                <TableCell className="py-1.5" onClick={(event) => event.stopPropagation()}>
                  <RequestStatusSelect
                    requestId={row.id}
                    requestLabel={`${requestCode(row.number)} ${row.title}`}
                    value={row.status}
                  />
                </TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">
                  <ExpectedOnCell value={row.expectedOn} overdue={row.overdue} />
                </TableCell>
                <TableCell className="hidden px-2 py-1.5 text-center md:table-cell">
                  <RequestBriefingButton
                    requestId={row.id}
                    title={`${requestCode(row.number)} ${row.title}`}
                    hasBriefing={row.hasBriefing}
                    load={getRequestBriefing}
                  />
                </TableCell>
                <TableCell className="px-2 py-1.5 text-center">
                  <MessagesCountLink href={`${href}#mensagens`} messages={row.messages} />
                </TableCell>
                <TableCell className="hidden px-2 py-1.5 text-center lg:table-cell">
                  <RequestHistoryButton requestId={row.id} load={getRequestTimeline} />
                </TableCell>
                <TableCell className="py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${requestCode(row.number)}`} />}
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem render={<Link href={href} />}>
                        <ExternalLinkIcon />
                        Abrir
                      </DropdownMenuItem>
                      <DropdownMenuItem render={<Link href={`${href}/editar`} />}>
                        <PencilIcon />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyPortalRequestLink(row.number)}>
                        <LinkIcon />
                        Copiar link do portal
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setDeleteTarget(row);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2Icon />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {deleteTarget && <DeleteRequestDialog open={deleteOpen} onOpenChange={setDeleteOpen} request={deleteTarget} />}
    </TableFrame>
  );
}
