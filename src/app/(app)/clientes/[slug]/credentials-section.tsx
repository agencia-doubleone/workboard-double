"use client";

import {
  AlertCircleIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  LockKeyholeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { Hint } from "@/components/hint";
import { PasswordField } from "@/components/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { displayUrl } from "@/lib/clients";
import { createCredentialSchema, updateCredentialSchema } from "@/lib/validations/clients";
import { createCredential, deleteCredential, revealCredential, updateCredential } from "../actions";
import type { CredentialRow } from "../types";

/** Quanto tempo a senha revelada fica na tela. */
const REVEAL_SECONDS = 30;

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; credential: CredentialRow; notes: string }
  | { kind: "delete"; credential: CredentialRow };

type CredentialsSectionProps = {
  clientId: string;
  credentials: CredentialRow[];
  isAdmin: boolean;
  /** VAULT_ENCRYPTION_KEY configurada no servidor. */
  vaultEnabled: boolean;
  archived: boolean;
};

async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Não foi possível copiar. Copie manualmente.");
  }
}

export function CredentialsSection({ clientId, credentials, isAdmin, vaultEnabled, archived }: CredentialsSectionProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [open, setOpen] = useState(false);
  const canManage = isAdmin && vaultEnabled && !archived;

  function openDialog(state: DialogState) {
    setDialog(state);
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyholeIcon className="size-4 text-muted-foreground" />
          Cofre de senhas
        </CardTitle>
        <CardDescription>
          {isAdmin
            ? "Senhas cifradas no banco. Cada senha revelada ou copiada fica registrada na auditoria."
            : "Logins dos serviços do cliente. As senhas ficam com os admins."}
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => openDialog({ kind: "create" })}>
              <PlusIcon />
              Novo acesso
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isAdmin && !vaultEnabled && (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>
              O cofre está desligado: falta a variável VAULT_ENCRYPTION_KEY no servidor (veja o .env.example).
            </AlertDescription>
          </Alert>
        )}
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
            <KeyRoundIcon className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum acesso guardado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Guarde aqui logins de redes sociais, hospedagem, painel do site, e-mail..."
                : "Quando um admin guardar acessos deste cliente, os logins aparecem aqui."}
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {credentials.map((credential) => (
              <CredentialItem
                key={credential.id}
                credential={credential}
                isAdmin={isAdmin}
                vaultEnabled={vaultEnabled}
                canManage={canManage}
                onEdit={(notes) => openDialog({ kind: "edit", credential, notes })}
                onDelete={() => openDialog({ kind: "delete", credential })}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {dialog?.kind === "delete" ? (
        <DeleteCredentialDialog open={open} onOpenChange={setOpen} credential={dialog.credential} />
      ) : dialog ? (
        <CredentialFormDialog
          key={dialog.kind === "edit" ? dialog.credential.id : "create"}
          open={open}
          onOpenChange={setOpen}
          clientId={clientId}
          editing={dialog.kind === "edit" ? dialog : null}
        />
      ) : null}
    </Card>
  );
}

function CredentialItem({
  credential,
  isAdmin,
  vaultEnabled,
  canManage,
  onEdit,
  onDelete,
}: {
  credential: CredentialRow;
  isAdmin: boolean;
  vaultEnabled: boolean;
  canManage: boolean;
  onEdit: (notes: string) => void;
  onDelete: () => void;
}) {
  const [secret, setSecret] = useState<{ password: string; notes: string | null } | null>(null);
  const [isPending, startTransition] = useTransition();
  const canReveal = isAdmin && vaultEnabled;

  // A senha revelada some sozinha depois de alguns segundos.
  useEffect(() => {
    if (!secret) return;
    const timer = window.setTimeout(() => setSecret(null), REVEAL_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [secret]);

  function reveal(purpose: "view" | "copy", then: (result: { password: string; notes: string | null }) => void) {
    startTransition(async () => {
      const result = await revealCredential({ credentialId: credential.id, purpose });
      if (result.ok) then(result);
      else toast.error(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <KeyRoundIcon className="size-4" />
          </span>
          <div className="grid min-w-0 leading-tight">
            <span className="truncate text-sm font-medium">{credential.service}</span>
            {credential.url ? (
              <a
                href={credential.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <span className="truncate">{displayUrl(credential.url)}</span>
                <ExternalLinkIcon className="size-3 shrink-0" />
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">Atualizado {credential.updated}</span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-sm" title={credential.username ?? undefined}>
            {credential.username ?? <span className="font-sans text-muted-foreground">Sem login</span>}
          </span>
          {credential.username && (
            <Hint label="Copiar login">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copiar login"
                onClick={() => copyText(credential.username!, "Login copiado.")}
              >
                <CopyIcon />
              </Button>
            </Hint>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-sm" aria-live="polite">
            {secret ? secret.password : <span className="tracking-widest text-muted-foreground">••••••••</span>}
          </span>
          {canReveal ? (
            <>
              <Hint label={secret ? "Ocultar senha" : "Mostrar senha"}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={secret ? "Ocultar senha" : "Mostrar senha"}
                  disabled={isPending}
                  onClick={() => (secret ? setSecret(null) : reveal("view", setSecret))}
                >
                  {isPending ? <Loader2Icon className="animate-spin" /> : secret ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              </Hint>
              <Hint label="Copiar senha">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Copiar senha"
                  disabled={isPending}
                  onClick={() =>
                    secret
                      ? copyText(secret.password, "Senha copiada.")
                      : reveal("copy", (result) => copyText(result.password, "Senha copiada."))
                  }
                >
                  <CopyIcon />
                </Button>
              </Hint>
            </>
          ) : (
            <Hint label="Só admins veem as senhas">
              <span className="flex size-6 items-center justify-center text-muted-foreground">
                <LockIcon className="size-3.5" />
              </span>
            </Hint>
          )}
        </div>

        <div className="flex justify-end">
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${credential.service}`} />}
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    credential.hasNotes ? reveal("view", (result) => onEdit(result.notes ?? "")) : onEdit("")
                  }
                >
                  <PencilIcon />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2Icon />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {secret?.notes && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap sm:ml-11">{secret.notes}</p>
      )}
      {!secret && credential.hasNotes && canReveal && (
        <p className="text-xs text-muted-foreground sm:ml-11">Tem observações: aparecem ao mostrar a senha.</p>
      )}
    </li>
  );
}

type FieldErrors = Record<string, string[] | undefined>;

function CredentialFormDialog({
  open,
  onOpenChange,
  clientId,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  editing: { credential: CredentialRow; notes: string } | null;
}) {
  const [service, setService] = useState(editing?.credential.service ?? "");
  const [url, setUrl] = useState(editing?.credential.url ?? "");
  const [username, setUsername] = useState(editing?.credential.username ?? "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const fields = { service, url, username, password, notes };
    const parsed = editing
      ? updateCredentialSchema.safeParse({ ...fields, credentialId: editing.credential.id })
      : createCredentialSchema.safeParse({ ...fields, clientId });
    if (!parsed.success) {
      setError(null);
      setFieldErrors(z.flattenError(parsed.error as z.ZodError).fieldErrors as FieldErrors);
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = editing
        ? await updateCredential({ ...fields, credentialId: editing.credential.id })
        : await createCredential({ ...fields, clientId });
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
            <DialogTitle>{editing ? `Editar ${editing.credential.service}` : "Novo acesso"}</DialogTitle>
            <DialogDescription>
              Senha e observações são cifradas antes de ir para o banco. Só admins conseguem ver.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={!!fieldErrors.service}>
              <FieldLabel htmlFor="credential-service">Serviço</FieldLabel>
              <Input
                id="credential-service"
                value={service}
                onChange={(event) => setService(event.target.value)}
                placeholder="Ex.: Instagram, Hospedagem, Painel do site"
                aria-invalid={!!fieldErrors.service}
                disabled={isPending}
                autoFocus
                autoComplete="off"
              />
              <FieldError>{fieldErrors.service?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.url}>
              <FieldLabel htmlFor="credential-url">Endereço</FieldLabel>
              <Input
                id="credential-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Opcional. Ex.: painel.hospedagem.com.br"
                aria-invalid={!!fieldErrors.url}
                disabled={isPending}
                autoComplete="off"
                spellCheck={false}
              />
              <FieldError>{fieldErrors.url?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.username}>
              <FieldLabel htmlFor="credential-username">Login</FieldLabel>
              <Input
                id="credential-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="E-mail ou usuário"
                aria-invalid={!!fieldErrors.username}
                disabled={isPending}
                autoComplete="off"
                spellCheck={false}
              />
              <FieldError>{fieldErrors.username?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.password}>
              <FieldLabel htmlFor="credential-password">Senha</FieldLabel>
              <PasswordField
                id="credential-password"
                value={password}
                onChange={setPassword}
                invalid={!!fieldErrors.password}
                disabled={isPending}
                placeholder={editing ? "Em branco, mantém a atual" : undefined}
                autoComplete="off"
                generator
              />
              <FieldError>{fieldErrors.password?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!fieldErrors.notes}>
              <FieldLabel htmlFor="credential-notes">Observações</FieldLabel>
              <Textarea
                id="credential-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Opcional. Ex.: código de recuperação, quem recebe o 2FA..."
                aria-invalid={!!fieldErrors.notes}
                disabled={isPending}
              />
              {fieldErrors.notes ? (
                <FieldError>{fieldErrors.notes[0]}</FieldError>
              ) : (
                <FieldDescription>Também ficam cifradas.</FieldDescription>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isPending} />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              {editing ? "Salvar alterações" : "Guardar acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCredentialDialog({
  open,
  onOpenChange,
  credential,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: CredentialRow;
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteCredential({ credentialId: credential.id });
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result.error);
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
          <AlertDialogTitle>Excluir {credential.service}?</AlertDialogTitle>
          <AlertDialogDescription>
            O login e a senha saem do cofre de forma definitiva. A exclusão fica registrada na auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
