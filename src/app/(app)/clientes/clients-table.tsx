"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Building2Icon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CLIENT_LINK_ICONS } from "@/components/brand-icons";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLIENT_LINKS, displayUrl } from "@/lib/clients";
import { cn } from "@/lib/utils";
import { ArchiveClientDialog } from "./archive-client-dialog";
import type { ClientRow } from "./types";

type ClientsTableProps = {
  rows: ClientRow[];
  isAdmin: boolean;
  /** Mostrando os arquivados (só admins). */
  archived: boolean;
  archivedCount: number;
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ClientsTable({ rows, isAdmin, archived, archivedCount }: ClientsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // Cliente do dialog de arquivar/reativar; o open separado mantém o texto durante a animação de saída.
  const [archiveTarget, setArchiveTarget] = useState<ClientRow | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return rows;
    return rows.filter((row) => normalize(`${row.name} ${row.website ?? ""}`).includes(query));
  }, [rows, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou site"
            aria-label="Buscar clientes"
          />
        </InputGroup>
        {isAdmin && (
          <nav aria-label="Situação" className="flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5 sm:ml-auto">
            <FilterLink href="/clientes" active={!archived}>
              Ativos
            </FilterLink>
            <FilterLink href="/clientes?arquivados=1" active={archived}>
              Arquivados
              <span className="text-xs text-muted-foreground tabular-nums">{archivedCount}</span>
            </FilterLink>
          </nav>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState isAdmin={isAdmin} archived={archived} />
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Redes</TableHead>
                <TableHead className="hidden lg:table-cell">Público-alvo</TableHead>
                <TableHead className="hidden sm:table-cell">Acessos</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Atualizado</TableHead>
                {isAdmin && (
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/clientes/${row.slug}`)}
                >
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <ClientLogo name={row.name} logoUrl={row.logoUrl} />
                      <div className="grid min-w-0 leading-tight">
                        <Link
                          href={`/clientes/${row.slug}`}
                          onClick={(event) => event.stopPropagation()}
                          className="truncate font-medium outline-none hover:underline focus-visible:underline"
                        >
                          {row.name}
                        </Link>
                        {row.website && (
                          <span className="truncate text-xs text-muted-foreground">{displayUrl(row.website)}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.socials.length ? (
                      <div className="flex gap-0.5">
                        {row.socials.map(({ key, url }) => {
                          const Icon = CLIENT_LINK_ICONS[key];
                          return (
                            <Hint key={key} label={CLIENT_LINKS[key].label}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`${CLIENT_LINKS[key].label} de ${row.name}`}
                                className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                              >
                                <Icon />
                              </a>
                            </Hint>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">
                    {row.audience}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 tabular-nums",
                        row.credentialCount === 0 && "text-muted-foreground",
                      )}
                    >
                      <KeyRoundIcon className="size-3.5 text-muted-foreground" />
                      {row.credentialCount}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                    <Hint label={row.updated.absolute}>
                      <span>{row.updated.relative}</span>
                    </Hint>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${row.name}`} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem render={<Link href={`/clientes/${row.slug}`} />}>
                            <ExternalLinkIcon />
                            Abrir
                          </DropdownMenuItem>
                          {!archived && (
                            <DropdownMenuItem render={<Link href={`/clientes/${row.slug}/editar`} />}>
                              <PencilIcon />
                              Editar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setArchiveTarget(row);
                              setArchiveOpen(true);
                            }}
                          >
                            {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                            {archived ? "Reativar" : "Arquivar"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="py-10 text-center text-muted-foreground">
                    Nenhum cliente encontrado para “{search.trim()}”.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableFrame>
      )}

      {archiveTarget && (
        <ArchiveClientDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          clientId={archiveTarget.id}
          name={archiveTarget.name}
          archived={archived}
        />
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex h-7 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-control dark:aria-[current=page]:bg-input/50"
    >
      {children}
    </Link>
  );
}

function EmptyState({ isAdmin, archived }: { isAdmin: boolean; archived: boolean }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Building2Icon />
        </EmptyMedia>
        <EmptyTitle>{archived ? "Nenhum cliente arquivado" : "Nenhum cliente ainda"}</EmptyTitle>
        <EmptyDescription>
          {archived
            ? "Clientes arquivados aparecem aqui e podem ser reativados."
            : isAdmin
              ? "Cadastre o primeiro cliente para guardar público-alvo, informações e acessos."
              : "Quando um admin cadastrar clientes, eles aparecem aqui."}
        </EmptyDescription>
      </EmptyHeader>
      {isAdmin && !archived && (
        <EmptyContent>
          <Link href="/clientes/novo" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            Cadastrar cliente
          </Link>
        </EmptyContent>
      )}
    </Empty>
  );
}
