"use client";

import { BuildingIcon, Loader2Icon, LockIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { SearchablePicker, type PickerOption } from "@/components/searchable-picker";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { WHITEBOARD_ACCESS, WHITEBOARD_ACCESS_KEYS, WHITEBOARD_LIMITS, type WhiteboardAccess } from "@/lib/whiteboards";
import { createWhiteboard, deleteWhiteboard, updateWhiteboard } from "./actions";
import type { WhiteboardFormValues, WhiteboardJobOption, WhiteboardPersonView } from "./types";

type FieldErrors = Record<string, string[] | undefined>;

const ACCESS_ICONS: Record<WhiteboardAccess, typeof LockIcon> = {
  private: LockIcon,
  members: UsersIcon,
  team: BuildingIcon,
};

export const EMPTY_WHITEBOARD: WhiteboardFormValues = { title: "", access: "private", memberIds: [], jobId: null };

type WhiteboardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem whiteboardId: cria. Com: edita (nome, acesso, pessoas, trabalho). */
  initial: WhiteboardFormValues;
  /** Equipe ativa (para escolher as pessoas). Quem está vendo fica de fora. */
  people: WhiteboardPersonView[];
  /** Trabalhos que dá para vincular. */
  jobs: WhiteboardJobOption[];
  /** Quem está editando não é o dono: não pode tornar o quadro pessoal. */
  ownerOnlyPrivate?: boolean;
  /** Pode excluir (o dono; nos coletivos, também os admins). */
  canDelete?: boolean;
};

export function WhiteboardDialog({
  open,
  onOpenChange,
  initial,
  people,
  jobs,
  ownerOnlyPrivate,
  canDelete,
}: WhiteboardDialogProps) {
  const router = useRouter();
  const id = useId();
  const editing = Boolean(initial.whiteboardId);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof WhiteboardFormValues>(key: K, value: WhiteboardFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const personOptions: PickerOption[] = people.map((person) => ({
    value: person.id,
    label: person.name,
    icon: <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-5 text-[9px]" />,
  }));
  const jobOptions: PickerOption[] = jobs.map((job) => ({ value: job.id, label: `#${job.pit} ${job.name}` }));

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) {
      setValues(initial);
      setError(null);
      setFieldErrors({});
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const payload = {
        title: values.title,
        access: values.access,
        memberIds: values.access === "members" ? values.memberIds : [],
        jobId: values.jobId,
      };
      const result = editing
        ? await updateWhiteboard({ ...payload, whiteboardId: initial.whiteboardId! }).catch(() => null)
        : await createWhiteboard(payload).catch(() => null);
      if (!result?.ok) {
        const failure = result && !result.ok ? result : null;
        setError(failure?.fieldErrors ? null : (failure?.error ?? "Não foi possível salvar o quadro."));
        setFieldErrors(failure?.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
      if (!editing && result.id) router.push(`/quadros/${result.id}`);
    });
  }

  function handleDelete() {
    if (!initial.whiteboardId) return;
    startTransition(async () => {
      const result = await deleteWhiteboard({ whiteboardId: initial.whiteboardId! }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível excluir o quadro.");
        return;
      }
      toast.success(result.message);
      setConfirmDelete(false);
      onOpenChange(false);
      router.push("/quadros");
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Configurar quadro" : "Novo quadro"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Nome, quem acessa e o trabalho vinculado. Todo mundo que acessa desenha e edita."
                : "Um espaço para desenhar, colar imagens e espalhar post-its. Dá para mudar tudo isso depois."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="-mx-5 flex min-h-0 flex-col overflow-y-auto px-5">
            <FieldGroup className="pb-2">
              {error && <p className="text-sm text-destructive-ink">{error}</p>}
              <Field data-invalid={!!fieldErrors.title}>
                <FieldLabel htmlFor={`${id}-title`}>Nome</FieldLabel>
                <Input
                  id={`${id}-title`}
                  value={values.title}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder="Ex.: Brainstorm da campanha de verão"
                  maxLength={WHITEBOARD_LIMITS.title}
                  aria-invalid={!!fieldErrors.title}
                  autoFocus={!editing}
                  disabled={isPending}
                />
                <FieldError>{fieldErrors.title?.[0]}</FieldError>
              </Field>

              <Field data-invalid={!!fieldErrors.access}>
                <FieldLabel id={`${id}-access-label`}>Quem acessa</FieldLabel>
                <div role="radiogroup" aria-labelledby={`${id}-access-label`} className="flex flex-col gap-2">
                  {WHITEBOARD_ACCESS_KEYS.map((access) => {
                    const Icon = ACCESS_ICONS[access];
                    const checked = values.access === access;
                    const blocked = access === "private" && ownerOnlyPrivate;
                    return (
                      <button
                        key={access}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={isPending || blocked}
                        onClick={() => set("access", access)}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                          checked && "border-primary bg-primary-soft hover:bg-primary-soft",
                        )}
                      >
                        <Icon className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", checked && "text-primary-ink")} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={cn("text-sm font-medium", checked && "text-primary-ink")}>
                            {WHITEBOARD_ACCESS[access].label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {blocked ? "Só quem criou pode tornar o quadro pessoal." : WHITEBOARD_ACCESS[access].description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <FieldError>{fieldErrors.access?.[0]}</FieldError>
              </Field>

              {values.access === "members" && (
                <Field data-invalid={!!fieldErrors.memberIds}>
                  <FieldLabel htmlFor={`${id}-members`}>Pessoas</FieldLabel>
                  <SearchablePicker
                    id={`${id}-members`}
                    multiple
                    options={personOptions}
                    value={values.memberIds}
                    onChange={(memberIds) => set("memberIds", memberIds)}
                    placeholder="Quem participa do quadro"
                    searchPlaceholder="Buscar pessoa..."
                    emptyText="Ninguém encontrado."
                    invalid={!!fieldErrors.memberIds}
                    disabled={isPending}
                  />
                  <FieldDescription>Quem você incluir recebe um aviso no sino.</FieldDescription>
                  <FieldError>{fieldErrors.memberIds?.[0]}</FieldError>
                </Field>
              )}

              <Field data-invalid={!!fieldErrors.jobId}>
                <FieldLabel htmlFor={`${id}-job`}>Trabalho (opcional)</FieldLabel>
                <SearchablePicker
                  id={`${id}-job`}
                  options={jobOptions}
                  value={values.jobId}
                  onChange={(jobId) => set("jobId", jobId)}
                  clearable
                  placeholder="Sem trabalho vinculado"
                  searchPlaceholder="Buscar pelo PIT ou nome..."
                  emptyText="Nenhum trabalho encontrado."
                  invalid={!!fieldErrors.jobId}
                  disabled={isPending}
                />
                <FieldDescription>
                  {values.access === "private"
                    ? "O quadro aparece na página do trabalho só para você."
                    : "O quadro aparece na página do trabalho para quem tem acesso a ele."}
                </FieldDescription>
                <FieldError>{fieldErrors.jobId?.[0]}</FieldError>
              </Field>
            </FieldGroup>

            <DialogFooter className="sticky bottom-0 -mx-5 mt-4 border-t bg-popover px-5 pt-4">
              {editing && canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-destructive-ink hover:text-destructive-ink"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isPending}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Excluir quadro
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && !confirmDelete && <Loader2Icon className="animate-spin" />}
                {editing ? "Salvar" : "Criar quadro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={(next) => !isPending && setConfirmDelete(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Excluir o quadro “{initial.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O desenho sai de vez, para todo mundo que tem acesso. Quem estiver com ele aberto é avisado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <HoldToConfirmButton
              label="Segure para excluir"
              pendingLabel="Excluindo..."
              icon={<Trash2Icon />}
              pending={isPending}
              onConfirm={handleDelete}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
