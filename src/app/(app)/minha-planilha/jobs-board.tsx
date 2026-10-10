"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon, CircleOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { celebrate, isCompletion } from "@/components/celebration";
import { ClientLogo } from "@/components/client-logo";
import { JobStatusBadge } from "@/components/job-status-badge";
import { cn } from "@/lib/utils";
import { moveSheetJob } from "../trabalhos/actions";
import { AssigneeAvatars } from "../trabalhos/job-widgets";
import { DueDate, MessagesLink } from "../trabalhos/jobs-table";
import { sheetAccessibility, useSheetSensors } from "../trabalhos/sheet-dnd";
import type { JobRow, JobStatusOption } from "../trabalhos/types";

// Quadro da Minha planilha: uma coluna por status, na ordem da planilha.
// Arrastar dentro da coluna reorganiza; soltar em outra coluna troca o status.

type Columns = Record<string, string[]>;

function groupByStatus(rows: JobRow[], statuses: JobStatusOption[]): Columns {
  const columns: Columns = Object.fromEntries(statuses.map((status) => [status.id, []]));
  for (const row of rows) columns[row.statusId]?.push(row.id);
  return columns;
}

type JobsBoardProps = {
  rows: JobRow[];
  /** Colunas, na ordem do cadastro de status. */
  statuses: JobStatusOption[];
  /** De quem é a planilha (a ordem salva é dessa pessoa). */
  ownerId: string;
  /** "Em aberto" não carrega os encerrados: as colunas deles só servem para soltar e encerrar. */
  finalColumnsAreDropOnly: boolean;
};

export function JobsBoard({ rows, statuses, ownerId, finalColumnsAreDropOnly }: JobsBoardProps) {
  const dndId = useId();
  const sensors = useSheetSensors();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Coluna e posição de onde o card saiu, para saber se algo mudou ao soltar.
  const origin = useRef<{ column: string; index: number } | null>(null);
  // Colunas na tela: mudam na hora ao arrastar e voltam às do servidor quando ele responde.
  const [columns, setColumns] = useState(() => groupByStatus(rows, statuses));
  const [serverRows, setServerRows] = useState(rows);
  if (rows !== serverRows) {
    setServerRows(rows);
    setColumns(groupByStatus(rows, statuses));
  }
  const byId = new Map(rows.map((row) => [row.id, row]));

  function findColumn(id: UniqueIdentifier) {
    const key = String(id);
    if (key in columns) return key;
    return Object.keys(columns).find((column) => columns[column].includes(key));
  }

  function handleDragStart({ active }: DragStartEvent) {
    const column = findColumn(active.id);
    if (!column) return;
    setActiveId(String(active.id));
    origin.current = { column, index: columns[column].indexOf(String(active.id)) };
  }

  // Passou para outra coluna: o card já muda de coluna durante o arraste.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setColumns((current) => {
      const target = [...current[to]];
      const overIndex = target.indexOf(String(over.id));
      const below =
        active.rect.current.translated !== null &&
        active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      target.splice(index, 0, String(active.id));
      return { ...current, [from]: current[from].filter((id) => id !== active.id), [to]: target };
    });
  }

  function reset() {
    setColumns(groupByStatus(rows, statuses));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const start = origin.current;
    origin.current = null;
    setActiveId(null);
    const id = String(active.id);
    const column = findColumn(id);
    if (!over || !start || !column) return reset();

    let items = columns[column];
    if (findColumn(over.id) === column && over.id !== id && !(String(over.id) in columns)) {
      items = arrayMove(items, items.indexOf(id), items.indexOf(String(over.id)));
    }
    const index = items.indexOf(id);
    if (column === start.column && index === start.index) return;
    setColumns({ ...columns, [column]: items });

    startTransition(async () => {
      const result = await moveSheetJob({
        ownerId,
        jobId: id,
        beforeId: items[index - 1] ?? null,
        afterId: items[index + 1] ?? null,
        statusId: column !== start.column ? column : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        reset();
        return;
      }
      if (result.message) toast.success(result.message);
      // Soltou na coluna de um status que encerra: trabalho concluído.
      const statusOf = (id: string) => statuses.find((status) => status.id === id);
      if (column !== start.column && isCompletion(statusOf(start.column), statusOf(column))) celebrate();
    });
  }

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        origin.current = null;
        setActiveId(null);
        reset();
      }}
      accessibility={sheetAccessibility((target) => {
        const row = byId.get(String(target));
        if (row) return `#${row.pit}`;
        const status = statuses.find((item) => item.id === target);
        return status ? `a coluna ${status.name}` : "";
      })}
    >
      <div className="-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-3">
        {statuses.map((status) => (
          <BoardColumn
            key={status.id}
            status={status}
            rows={(columns[status.id] ?? []).flatMap((id) => byId.get(id) ?? [])}
            emptyText={finalColumnsAreDropOnly && status.isFinal ? "Solte aqui para encerrar" : "Nenhum trabalho"}
          />
        ))}
      </div>
      <DragOverlay>{active ? <JobCard row={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function BoardColumn({ status, rows, emptyText }: { status: JobStatusOption; rows: JobRow[]; emptyText: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section
      aria-label={status.name}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-ring/40 bg-primary-soft/40",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <JobStatusBadge name={status.name} textColor={status.textColor} backgroundColor={status.backgroundColor} />
        <span className="text-xs font-medium text-muted-foreground tabular-nums">{rows.length}</span>
      </header>
      <SortableContext id={status.id} items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2 px-2 pb-2">
          {rows.map((row) => (
            <SortableCard key={row.id} row={row} />
          ))}
          {rows.length === 0 && (
            <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              {emptyText}
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

/** O card inteiro arrasta; um clique (sem arrastar) abre o trabalho. */
function SortableCard({ row }: { row: JobRow }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`#${row.pit} ${row.name}`}
      onClick={() => router.push(`/trabalhos/${row.pit}`)}
      className="cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      <JobCard row={row} placeholder={isDragging} />
    </div>
  );
}

function JobCard({ row, overlay = false, placeholder = false }: { row: JobRow; overlay?: boolean; placeholder?: boolean }) {
  const href = `/trabalhos/${row.pit}`;
  return (
    <article
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-card p-3 text-sm shadow-raised",
        !row.active && "bg-card/70",
        overlay && "rotate-1 shadow-overlay",
        placeholder && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <ClientLogo name={row.client.name} logoUrl={row.client.logoUrl} className="size-5 text-[8px]" />
          <span className="truncate">{row.client.name}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">#{row.pit}</span>
      </div>
      <Link
        href={href}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "line-clamp-3 font-medium leading-snug outline-none hover:underline focus-visible:underline",
          !row.active && "text-muted-foreground",
        )}
      >
        {row.name}
      </Link>
      {!row.active && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CircleOffIcon className="size-3" />
          Inativo
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {row.dueDate && (
            <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <CalendarIcon className="size-3.5" />
              <DueDate dueDate={row.dueDate} overdue={row.overdue} />
            </span>
          )}
          <MessagesLink href={`${href}#mensagens`} messages={row.messages} />
        </div>
        {row.assignees.length > 0 && <AssigneeAvatars people={row.assignees} showName={false} />}
      </div>
    </article>
  );
}
