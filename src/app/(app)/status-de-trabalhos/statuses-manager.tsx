"use client";

import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircleIcon,
  BanIcon,
  CheckCircle2Icon,
  GripVerticalIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ColorField } from "@/components/color-field";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { createJobStatusSchema } from "@/lib/validations/jobs";
import { sheetAccessibility, useSheetSensors, verticalOnly } from "../trabalhos/sheet-dnd";
import {
  createJobStatus,
  deleteJobStatus,
  reorderJobStatuses,
  setDefaultJobStatus,
  updateJobStatus,
  type StatusActionResult,
} from "./actions";

export type StatusRow = {
  id: string;
  name: string;
  textColor: string;
  backgroundColor: string;
  isDefault: boolean;
  isFinal: boolean;
  isCanceled: boolean;
  jobCount: number;
};

type FieldErrors = Record<string, string[] | undefined>;

function useAction() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<StatusActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }
  return { isPending, run };
}

export function StatusesManager({ rows }: { rows: StatusRow[] }) {
  const dndId = useId();
  const sensors = useSheetSensors();
  const [editing, setEditing] = useState<StatusRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { run } = useAction();
  const [, startReorder] = useTransition();
  // Ordem na tela: muda na hora ao soltar e volta à do servidor quando ela chega.
  const [items, setItems] = useState(rows);
  const [serverRows, setServerRows] = useState(rows);
  if (rows !== serverRows) {
    setServerRows(rows);
    setItems(rows);
  }

  function openForm(row: StatusRow | null) {
    setEditing(row);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((row) => row.id === active.id);
    const to = items.findIndex((row) => row.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    setItems(next);
    startReorder(async () => {
      const result = await reorderJobStatuses({ statusId: String(active.id), orderedIds: next.map((row) => row.id) });
      if (!result.ok) {
        toast.error(result.error);
        setItems(rows);
      }
    });
  }

  const rowProps = {
    onEdit: openForm,
    onSetDefault: (row: StatusRow) => run(() => setDefaultJobStatus({ statusId: row.id })),
    onDelete: (row: StatusRow) => run(() => deleteJobStatus({ statusId: row.id })),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openForm(null)}>
          <PlusIcon data-icon="inline-start" />
          Novo status
        </Button>
      </div>

      <TableFrame>
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragEnd={handleDragEnd}
          accessibility={sheetAccessibility((id) => items.find((row) => row.id === id)?.name ?? "", "status")}
        >
          <SortableContext items={items.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pr-0">
                    <span className="sr-only">Ordem</span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Comportamento</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Trabalhos</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <SortableStatusRow key={row.id} row={row} {...rowProps} />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </TableFrame>
      <p className="text-xs text-muted-foreground">
        Arraste pela alça para mudar a ordem. Só dá para excluir um status sem trabalhos. O padrão não pode encerrar nem
        cancelar o trabalho.
      </p>

      <StatusFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </div>
  );
}

type StatusRowProps = {
  row: StatusRow;
  onEdit: (row: StatusRow) => void;
  onSetDefault: (row: StatusRow) => void;
  onDelete: (row: StatusRow) => void;
};

/** Linha arrastável: a alça (⋮⋮) move; o resto da linha fica como estava. */
function SortableStatusRow({ row, onEdit, onSetDefault, onDelete }: StatusRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 bg-card shadow-overlay hover:bg-card")}
    >
      <TableCell className="w-8 py-1.5 pr-0">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${row.name}`}
          className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      </TableCell>
      <TableCell>
        <JobStatusBadge name={row.name} textColor={row.textColor} backgroundColor={row.backgroundColor} />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1.5">
          {row.isDefault && (
            <Badge variant="soft">
              <StarIcon data-icon="inline-start" />
              Padrão para novos
            </Badge>
          )}
          {row.isCanceled ? (
            <Badge variant="destructive">
              <BanIcon data-icon="inline-start" />
              Cancela o trabalho
            </Badge>
          ) : (
            row.isFinal && (
              <Badge variant="outline">
                <CheckCircle2Icon data-icon="inline-start" />
                Encerra o trabalho
              </Badge>
            )
          )}
          {!row.isDefault && !row.isFinal && <span className="text-muted-foreground">—</span>}
        </div>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.jobCount}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${row.name}`} />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onEdit(row)}>
              <PencilIcon />
              Editar
            </DropdownMenuItem>
            {!row.isDefault && !row.isFinal && (
              <DropdownMenuItem onClick={() => onSetDefault(row)}>
                <StarIcon />
                Usar como padrão
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={row.isDefault} onClick={() => onDelete(row)}>
              <Trash2Icon />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function StatusFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: StatusRow | null;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [textColor, setTextColor] = useState(editing?.textColor ?? "#ffffff");
  const [backgroundColor, setBackgroundColor] = useState(editing?.backgroundColor ?? "#2563eb");
  const [isFinal, setIsFinal] = useState(editing?.isFinal ?? false);
  const [isCanceled, setIsCanceled] = useState(editing?.isCanceled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const values = { name, textColor, backgroundColor, isFinal: isFinal || isCanceled, isCanceled };
    const parsed = createJobStatusSchema.safeParse(values);
    if (!parsed.success) {
      setError(null);
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = editing
        ? await updateJobStatus({ ...values, statusId: editing.id })
        : await createJobStatus(values);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        setError(result.fieldErrors ? null : result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${editing.name}` : "Novo status"}</DialogTitle>
            <DialogDescription>
              {editing && editing.jobCount > 0
                ? `Mudanças valem para os ${editing.jobCount} trabalhos que usam este status.`
                : "Aparece no seletor de status dos trabalhos, na ordem da lista."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/30 py-5">
            <JobStatusBadge
              name={name.trim() || "Nome do status"}
              textColor={/^#[0-9a-f]{6}$/i.test(textColor) ? textColor : "#000000"}
              backgroundColor={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "transparent"}
              className="h-7 px-3 text-sm"
            />
          </div>

          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={!!fieldErrors.name}>
              <FieldLabel htmlFor="status-name">Nome</FieldLabel>
              <Input
                id="status-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Em revisão"
                aria-invalid={!!fieldErrors.name}
                disabled={isPending}
                autoFocus
                autoComplete="off"
              />
              <FieldError>{fieldErrors.name?.[0]}</FieldError>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!fieldErrors.textColor}>
                <FieldLabel htmlFor="status-text">Cor da letra</FieldLabel>
                <ColorField id="status-text" value={textColor} onChange={setTextColor} invalid={!!fieldErrors.textColor} disabled={isPending} />
                <FieldError>{fieldErrors.textColor?.[0]}</FieldError>
              </Field>
              <Field data-invalid={!!fieldErrors.backgroundColor}>
                <FieldLabel htmlFor="status-background">Cor do fundo</FieldLabel>
                <ColorField
                  id="status-background"
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                  invalid={!!fieldErrors.backgroundColor}
                  disabled={isPending}
                />
                <FieldError>{fieldErrors.backgroundColor?.[0]}</FieldError>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch
                id="status-final"
                checked={isFinal || isCanceled}
                onCheckedChange={setIsFinal}
                disabled={isPending || editing?.isDefault || isCanceled}
              />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="status-final">Encerra o trabalho</FieldLabel>
                <FieldDescription>
                  {editing?.isDefault
                    ? "O status padrão não pode encerrar o trabalho."
                    : isCanceled
                      ? "Todo status de cancelamento encerra o trabalho."
                      : "Trabalhos neste status saem da lista “Em aberto” e não contam como atrasados."}
                </FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="status-canceled"
                checked={isCanceled}
                onCheckedChange={setIsCanceled}
                disabled={isPending || editing?.isDefault}
              />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="status-canceled">Cancela o trabalho</FieldLabel>
                <FieldDescription>
                  {editing?.isDefault
                    ? "O status padrão não pode cancelar o trabalho."
                    : "Trabalhos neste status saem da planilha, do calendário, do Início e dos relatórios, e ficam em “Cancelados”. Só admins cancelam."}
                </FieldDescription>
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isPending} />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              {editing ? "Salvar alterações" : "Criar status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
