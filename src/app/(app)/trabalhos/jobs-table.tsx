"use client";

import {
  AtSignIcon,
  BriefcaseIcon,
  CircleOffIcon,
  CirclePlayIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ClientLogo } from "@/components/client-logo";
import { Hint } from "@/components/hint";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { setJobActive } from "./actions";
import { DeleteJobDialog } from "./delete-job-dialog";
import { AssigneeAvatars, BriefingButton, StatusHistoryButton } from "./job-widgets";
import { StatusSelect } from "./status-select";
import type { JobRow, JobStatusOption } from "./types";

type JobsTableProps = {
  rows: JobRow[];
  statuses: JobStatusOption[];
  isAdmin: boolean;
  /** Há busca ou filtro aplicado (muda o texto do estado vazio). */
  filtered: boolean;
};

export function JobsTable({ rows, statuses, isAdmin, filtered }: JobsTableProps) {
  const router = useRouter();
  // Trabalho do dialog de excluir; o open separado mantém o texto durante a animação de saída.
  const [deleteTarget, setDeleteTarget] = useState<JobRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [, startTransition] = useTransition();

  function toggleActive(row: JobRow) {
    startTransition(async () => {
      const result = await setJobActive({ jobId: row.id, active: !row.active });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  if (rows.length === 0) return <EmptyState filtered={filtered} />;

  return (
    <>
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">PIT</TableHead>
              <TableHead className="hidden 2xl:table-cell">Lançamento</TableHead>
              <TableHead className="hidden sm:table-cell">Cliente</TableHead>
              <TableHead>Trabalho</TableHead>
              <TableHead className="hidden lg:table-cell">Funcionários</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Entrega</TableHead>
              <TableHead className="hidden px-2 text-center md:table-cell">Briefing</TableHead>
              <TableHead className="px-2 text-center">Mensagens</TableHead>
              <TableHead className="hidden px-2 text-center min-[90rem]:table-cell">Histórico</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = `/trabalhos/${row.pit}`;
              return (
                <TableRow
                  key={row.id}
                  className={cn("cursor-pointer", !row.active && "text-muted-foreground")}
                  onClick={() => router.push(href)}
                >
                  <TableCell className="font-medium tabular-nums">
                    <Link
                      href={href}
                      onClick={(event) => event.stopPropagation()}
                      className="outline-none hover:underline focus-visible:underline"
                    >
                      {row.pit}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums 2xl:table-cell">
                    <Hint label={row.createdAt.absolute}>
                      <span>{row.createdAt.date}</span>
                    </Hint>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="flex max-w-32 min-w-0 items-center gap-2 2xl:max-w-44">
                      <ClientLogo name={row.client.name} logoUrl={row.client.logoUrl} className="size-6 text-[9px]" />
                      <span className="truncate">{row.client.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="max-w-80 min-w-36 whitespace-normal">
                    <Link
                      href={href}
                      onClick={(event) => event.stopPropagation()}
                      className={cn(
                        "line-clamp-2 font-medium outline-none hover:underline focus-visible:underline",
                        row.active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {row.name}
                    </Link>
                    {!row.active && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <CircleOffIcon className="size-3" />
                        Inativo
                      </span>
                    )}
                    <span className="block truncate text-xs text-muted-foreground sm:hidden">{row.client.name}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-48 lg:table-cell">
                    <AssigneeAvatars people={row.assignees} />
                  </TableCell>
                  <TableCell className="py-1.5" onClick={(event) => event.stopPropagation()}>
                    <StatusSelect jobId={row.id} value={row.statusId} statuses={statuses} compact />
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    {row.dueDate ? (
                      <Hint label={row.overdue ? `Atrasado: entrega em ${row.dueDate.full}` : row.dueDate.full}>
                        <span className={cn(row.overdue && "font-medium text-destructive-ink")}>{row.dueDate.label}</span>
                      </Hint>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden px-2 py-1.5 text-center md:table-cell">
                    <BriefingButton jobId={row.id} title={`#${row.pit} ${row.name}`} hasBriefing={row.hasBriefing} />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center">
                    <MessagesLink href={`${href}#mensagens`} messages={row.messages} />
                  </TableCell>
                  <TableCell className="hidden px-2 py-1.5 text-center min-[90rem]:table-cell">
                    <StatusHistoryButton jobId={row.id} />
                  </TableCell>
                  <TableCell className="py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de #${row.pit}`} />}
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem render={<Link href={href} />}>
                          <ExternalLinkIcon />
                          Abrir
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href={`${href}/editar`} />}>
                          <PencilIcon />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(row)}>
                          {row.active ? <CircleOffIcon /> : <CirclePlayIcon />}
                          {row.active ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
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
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>

      {deleteTarget && <DeleteJobDialog open={deleteOpen} onOpenChange={setDeleteOpen} job={deleteTarget} />}
    </>
  );
}

/** Contador de mensagens: total, e as não lidas em destaque (com @ quando há menção). */
function MessagesLink({ href, messages }: { href: string; messages: JobRow["messages"] }) {
  const { total, unread, mentioned } = messages;
  const label =
    total === 0
      ? "Nenhuma mensagem"
      : unread > 0
        ? `${unread} não ${unread === 1 ? "lida" : "lidas"} de ${total}${mentioned ? ", com menção a você" : ""}`
        : `${total} ${total === 1 ? "mensagem" : "mensagens"}`;
  return (
    <Hint label={label}>
      <Link
        href={href}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
          total === 0 && "text-muted-foreground/70",
        )}
      >
        <MessageSquareIcon className="size-3.5" />
        {total}
        {unread > 0 && (
          <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center gap-0.5 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {mentioned && <AtSignIcon className="size-2.5" />}
            {unread}
          </span>
        )}
      </Link>
    </Hint>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BriefcaseIcon />
        </EmptyMedia>
        <EmptyTitle>{filtered ? "Nenhum trabalho encontrado" : "Nenhum trabalho aqui"}</EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Ajuste a busca ou os filtros para ver outros trabalhos."
            : "Cadastre um trabalho para acompanhar status, entrega, briefing e a conversa da equipe."}
        </EmptyDescription>
      </EmptyHeader>
      {!filtered && (
        <EmptyContent>
          <Link href="/trabalhos/novo" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            Novo trabalho
          </Link>
        </EmptyContent>
      )}
    </Empty>
  );
}
