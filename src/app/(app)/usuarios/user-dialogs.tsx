"use client";

import { AlertCircleIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { PasswordField } from "@/components/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isRole, ROLE_LABELS, ROLES, type Role } from "@/lib/users";
import {
  createUserSchema,
  setUserPasswordSchema,
  updateUserSchema,
} from "@/lib/validations/users";
import {
  createUser,
  deleteUser,
  setUserPassword,
  updateUser,
  type ActionResult,
} from "./actions";
import type { UserRow } from "./types";

type FieldErrors = Record<string, string[] | undefined>;

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ActionSuccess = Extract<ActionResult, { ok: true }>;

/** Envia, mostra erros de campo/gerais e chama onSuccess (com toast) ao dar certo. */
function useActionForm(onSuccess: (result: ActionSuccess) => void) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function submit<T>(schema: z.ZodType<T>, values: unknown, action: (data: T) => Promise<ActionResult>) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      setError(null);
      return;
    }
    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      const result = await action(parsed.data);
      if (result.ok) {
        toast.success(result.message);
        onSuccess(result);
        return;
      }
      setError(result.fieldErrors ? null : result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  return { isPending, error, fieldErrors, submit };
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  );
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  isSelf = false,
}: DialogProps & { user?: UserRow; isSelf?: boolean }) {
  const editing = Boolean(user);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "user");
  const [password, setPassword] = useState("");
  // Senha gerada pelo servidor: exibida uma única vez, depois de criar.
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const { isPending, error, fieldErrors, submit } = useActionForm((result) => {
    if (result.generatedPassword) setGeneratedPassword(result.generatedPassword);
    else onOpenChange(false);
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (user) {
      submit(updateUserSchema, { userId: user.id, name, email, role }, updateUser);
    } else {
      submit(createUserSchema, { name, email, role, password }, createUser);
    }
  }

  if (generatedPassword) {
    return (
      // Sem fechar ao clicar fora: a senha não pode ser recuperada depois.
      <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Usuário criado</DialogTitle>
            <DialogDescription>
              Esta é a senha de acesso de {name.trim()}. Copie agora e repasse por
              um canal seguro: ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="generated-email">E-mail</FieldLabel>
              <Input id="generated-email" value={email.trim().toLowerCase()} readOnly />
            </Field>
            <Field>
              <FieldLabel htmlFor="generated-password">Senha gerada</FieldLabel>
              <PasswordField id="generated-password" value={generatedPassword} readOnly />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button />}>Concluir</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Alterações de papel valem a partir da próxima ação do usuário."
                : "A pessoa entra com o e-mail e a senha definidos aqui."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <FormError message={error} />
            <Field data-invalid={!!fieldErrors.name}>
              <FieldLabel htmlFor="user-name">Nome</FieldLabel>
              <Input
                id="user-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!fieldErrors.name}
                disabled={isPending}
                autoComplete="off"
                autoFocus
              />
              <FieldError>{fieldErrors.name?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.email}>
              <FieldLabel htmlFor="user-email">E-mail</FieldLabel>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={!!fieldErrors.email}
                disabled={isPending}
                autoComplete="off"
                placeholder="nome@doubleone.com.br"
              />
              <FieldError>{fieldErrors.email?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.role}>
              <FieldLabel htmlFor="user-role">Papel</FieldLabel>
              <Select
                items={ROLE_LABELS}
                value={role}
                onValueChange={(value) => isRole(value) && setRole(value)}
                disabled={isPending || isSelf}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ROLE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {isSelf
                  ? "Você não pode alterar o próprio papel."
                  : "Administradores gerenciam usuários e veem a auditoria."}
              </FieldDescription>
              <FieldError>{fieldErrors.role?.[0]}</FieldError>
            </Field>
            {!editing && (
              <Field data-invalid={!!fieldErrors.password}>
                <FieldLabel htmlFor="user-password">
                  Senha inicial
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </FieldLabel>
                <PasswordField
                  id="user-password"
                  value={password}
                  onChange={setPassword}
                  invalid={!!fieldErrors.password}
                  disabled={isPending}
                  placeholder="Gerada automaticamente"
                  generator
                />
                <FieldDescription>
                  Em branco, uma senha forte é gerada e mostrada uma vez após criar.
                </FieldDescription>
                <FieldError>{fieldErrors.password?.[0]}</FieldError>
              </Field>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isPending} />}>
              Cancelar
            </DialogClose>
            <SubmitButton pending={isPending}>
              {editing ? "Salvar alterações" : "Criar usuário"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SetPasswordDialog({
  open,
  onOpenChange,
  user,
  isSelf,
}: DialogProps & { user: UserRow; isSelf: boolean }) {
  const [password, setPassword] = useState("");
  const { isPending, error, fieldErrors, submit } = useActionForm(() => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(setUserPasswordSchema, { userId: user.id, password }, setUserPassword);
          }}
          noValidate
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Definir nova senha</DialogTitle>
            <DialogDescription>
              {isSelf
                ? "Para a sua conta. Suas outras sessões serão encerradas."
                : `Para ${user.name}. Todas as sessões abertas serão encerradas e a pessoa precisará entrar de novo.`}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormError message={error} />
            <Field data-invalid={!!fieldErrors.password}>
              <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
              <PasswordField
                id="new-password"
                value={password}
                onChange={setPassword}
                invalid={!!fieldErrors.password}
                disabled={isPending}
                generator
              />
              <FieldError>{fieldErrors.password?.[0]}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isPending} />}>
              Cancelar
            </DialogClose>
            <SubmitButton pending={isPending}>Salvar senha</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ConfirmDialogProps = DialogProps & {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Campo opcional de motivo (ex.: ao desativar). */
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<ActionResult>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  reasonLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm(reason);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {reasonLabel && (
          <Field>
            <FieldLabel htmlFor="confirm-reason">{reasonLabel}</FieldLabel>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
              maxLength={300}
              rows={2}
              placeholder="Opcional. Fica registrado na auditoria."
            />
          </Field>
        )}
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
}: DialogProps & { user: UserRow }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteUser({ userId: user.id });
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Excluir {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A conta de <strong>{user.email}</strong> e todas as sessões serão removidas de
            forma definitiva. O histórico na auditoria é mantido. Se a pessoa pode voltar,
            prefira desativar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <HoldToConfirmButton
            label="Segure para excluir"
            pendingLabel="Excluindo..."
            icon={<Trash2Icon />}
            pending={isPending}
            onConfirm={handleConfirm}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
