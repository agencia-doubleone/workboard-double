"use client";

import { ArrowRightIcon, HistoryIcon, PanelRightOpenIcon, ScrollTextIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { AuditRow } from "./types";

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [open, setOpen] = useState(false);

  function openDetails(row: AuditRow) {
    setSelected(row);
    setOpen(true);
  }

  if (rows.length === 0) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollTextIcon />
          </EmptyMedia>
          <EmptyTitle>Nenhum evento encontrado</EmptyTitle>
          <EmptyDescription>
            Ajuste os filtros. Os eventos aparecem conforme as pessoas usam o sistema.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Ator</TableHead>
              <TableHead>Alvo</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Detalhes</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => openDetails(row)}
                className="cursor-pointer"
              >
                <TableCell>
                  <Hint label={row.when.absolute}>
                    <span className="cursor-default">{row.when.relative}</span>
                  </Hint>
                </TableCell>
                <TableCell>
                  <EventLabel row={row} />
                </TableCell>
                <TableCell>
                  <Person person={row.actor} fallback={row.actorFallback} />
                </TableCell>
                <TableCell>
                  {row.entity ? (
                    <span className="grid leading-tight">
                      <span className="truncate">{row.entity.label ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{row.entity.typeLabel}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.ipAddress ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Detalhes: ${row.actionLabel}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openDetails(row);
                    }}
                  >
                    <PanelRightOpenIcon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-md">
          {selected && <AuditDetails row={selected} onNavigate={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

const TONE_CLASSES: Record<AuditRow["tone"], string> = {
  default: "",
  warning: "bg-warning",
  danger: "bg-destructive",
};

function EventLabel({ row }: { row: AuditRow }) {
  const dot =
    TONE_CLASSES[row.tone] || (row.category === "users" ? "bg-primary" : "bg-muted-foreground/50");
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      <span className="font-medium">{row.actionLabel}</span>
    </span>
  );
}

function Person({
  person,
  fallback,
}: {
  person: AuditRow["actor"];
  fallback: string;
}) {
  if (!person) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <span className="grid leading-tight">
      <span className="truncate">{person.name ?? person.email}</span>
      {person.name && <span className="truncate text-xs text-muted-foreground">{person.email}</span>}
    </span>
  );
}

function AuditDetails({ row, onNavigate }: { row: AuditRow; onNavigate: () => void }) {
  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="flex items-center gap-2">
          <EventLabel row={row} />
        </SheetTitle>
        <SheetDescription className="tabular-nums">
          {row.when.absolute} · {row.when.relative}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Ator</dt>
          <dd className="min-w-0">
            <Person person={row.actor} fallback={row.actorFallback} />
          </dd>
          <dt className="text-muted-foreground">Alvo</dt>
          <dd className="min-w-0">
            {row.entity ? (
              <span className="grid gap-1">
                <span className="truncate">
                  {row.entity.label ?? "—"}{" "}
                  <span className="text-muted-foreground">· {row.entity.typeLabel}</span>
                </span>
                {row.entity.href && (
                  <Link
                    href={row.entity.href}
                    onClick={onNavigate}
                    className="inline-flex w-fit items-center gap-1 text-xs text-primary-ink underline-offset-4 hover:underline"
                  >
                    <HistoryIcon className="size-3" />
                    Ver histórico deste registro
                  </Link>
                )}
              </span>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted-foreground">IP</dt>
          <dd className="font-mono text-xs">{row.ipAddress ?? "—"}</dd>
          <dt className="text-muted-foreground">Navegador</dt>
          <dd className="font-mono text-xs break-all text-muted-foreground">
            {row.userAgent ?? "—"}
          </dd>
        </dl>

        {row.changes.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">Alterações</h3>
            <div className="overflow-hidden rounded-lg border">
              {row.changes.map((change) => (
                <div
                  key={change.field}
                  className="grid grid-cols-[6rem_1fr] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <span className="text-muted-foreground">{change.field}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate text-muted-foreground line-through decoration-muted-foreground/40">
                      {change.from}
                    </span>
                    <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{change.to}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {row.details.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">Detalhes</h3>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
              {row.details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd className="min-w-0 break-words">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </>
  );
}
