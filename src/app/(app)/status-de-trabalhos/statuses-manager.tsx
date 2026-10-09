"use client";

import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ColorField } from "@/components/color-field";
import { Hint } from "@/components/hint";
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
import { createJobStatusSchema } from "@/lib/validations/jobs";
import {
  createJobStatus,
  deleteJobStatus,
  moveJobStatus,
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
  const [editing, setEditing] = useState<StatusRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { isPending, run } = useAction();

  function openForm(row: StatusRow | null) {
    setEditing(row);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openForm(null)}>
          <PlusIcon data-icon="inline-start" />
          Novo status
        </Button>
      </div>

      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Comportamento</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Trabalhos</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex gap-0.5">
                    <Hint label="Subir">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Subir ${row.name}`}
                        disabled={index === 0 || isPending}
                        onClick={() => run(() => moveJobStatus({ statusId: row.id, direction: "up" }))}
                      >
                        <ArrowUpIcon />
                      </Button>
                    </Hint>
                    <Hint label="Descer">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Descer ${row.name}`}
                        disabled={index === rows.length - 1 || isPending}
                        onClick={() => run(() => moveJobStatus({ statusId: row.id, direction: "down" }))}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </Hint>
                  </div>
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
                    {row.isFinal && (
                      <Badge variant="outline">
                        <CheckCircle2Icon data-icon="inline-start" />
                        Encerra o trabalho
                      </Badge>
                    )}
                    {!row.isDefault && !row.isFinal && <span className="text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.jobCount}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${row.name}`} />}
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openForm(row)}>
                        <PencilIcon />
                        Editar
                      </DropdownMenuItem>
                      {!row.isDefault && !row.isFinal && (
                        <DropdownMenuItem onClick={() => run(() => setDefaultJobStatus({ statusId: row.id }))}>
                          <StarIcon />
                          Usar como padrão
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={row.isDefault}
                        onClick={() => run(() => deleteJobStatus({ statusId: row.id }))}
                      >
                        <Trash2Icon />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <p className="text-xs text-muted-foreground">
        Só dá para excluir um status sem trabalhos. O padrão não pode encerrar o trabalho.
      </p>

      <StatusFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </div>
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
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const values = { name, textColor, backgroundColor, isFinal };
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
                checked={isFinal}
                onCheckedChange={setIsFinal}
                disabled={isPending || editing?.isDefault}
              />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="status-final">Encerra o trabalho</FieldLabel>
                <FieldDescription>
                  {editing?.isDefault
                    ? "O status padrão não pode encerrar o trabalho."
                    : "Trabalhos neste status saem da lista “Em aberto” e não contam como atrasados."}
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
