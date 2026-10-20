"use client";

import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  DoorOpenIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { Hint } from "@/components/hint";
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
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/user-avatar";
import { PORTAL_CONTACT_STATUS_LABELS, type PortalContactStatus } from "@/lib/portal";
import { createPortalContactSchema, updatePortalContactSchema } from "@/lib/validations/portal";
import {
  createPortalContact,
  deletePortalContact,
  resendPortalInvite,
  setPortalContactDisabled,
  updatePortalContact,
  type PortalActionResult,
} from "../portal-actions";
import type { PortalContactRow } from "../types";

type DialogState =
  | { kind: "form"; contact: PortalContactRow | null }
  | { kind: "disable"; contact: PortalContactRow }
  | { kind: "delete"; contact: PortalContactRow };

const STATUS_BADGES: Record<PortalContactStatus, "success" | "outline" | "destructive"> = {
  active: "success",
  pending: "outline",
  disabled: "destructive",
};

type Props = {
  clientId: string;
  clientName: string;
  contacts: PortalContactRow[];
  /** Admin e cliente não arquivado. */
  canManage: boolean;
  archived: boolean;
  emailEnabled: boolean;
  /** Endereço completo da tela de entrada do portal (para copiar e mandar). */
  portalUrl: string;
};

/** Quem do cliente entra no portal: criar, editar, convidar, desativar e excluir. Só admins veem. */
export function PortalContactsSection({ clientId, clientName, contacts, canManage, archived, emailEnabled, portalUrl }: Props) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [open, setOpen] = useState(false);
  // Cada abertura é um formulário novo (chave nova), nunca o rascunho anterior.
  const [openings, setOpenings] = useState(0);
  const [copied, setCopied] = useState(false);

  function openDialog(state: DialogState) {
    setDialog(state);
    setOpenings((count) => count + 1);
    setOpen(true);
  }

  async function copyPortalUrl() {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast.success("Endereço do portal copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpenIcon className="size-4 text-muted-foreground" />
          Acessos ao portal
        </CardTitle>
        <CardDescription>
          Quem da {clientName} entra no portal do cliente. A pessoa entra com o e-mail e um código que chega nele, sem
          senha.
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => openDialog({ kind: "form", contact: null })}>
              <PlusIcon />
              Novo acesso
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {archived && (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>Cliente arquivado: ninguém dele entra no portal até ser reativado.</AlertDescription>
          </Alert>
        )}
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
            <UsersRoundIcon className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">Ninguém do cliente tem acesso ainda</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Crie um acesso para cada pessoa da {clientName} que vai acompanhar os pedidos e aprovar as entregas.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-center gap-3 px-4 py-3">
                <UserAvatar name={contact.name} imageUrl={contact.imageUrl} className="size-8 text-[11px]" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">{contact.name}</span>
                    <Badge variant={STATUS_BADGES[contact.status]}>{PORTAL_CONTACT_STATUS_LABELS[contact.status]}</Badge>
                    {!contact.canApprove && (
                      <Hint label="Vê as entregas, mas não aprova nem pede alterações">
                        <Badge variant="outline">Só acompanha</Badge>
                      </Hint>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {contact.email}
                    {contact.lastSignIn
                      ? ` · último acesso ${contact.lastSignIn}`
                      : contact.invited
                        ? ` · convite enviado ${contact.invited}`
                        : ""}
                  </span>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${contact.name}`} />}
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openDialog({ kind: "form", contact })}>
                        <PencilIcon />
                        Editar
                      </DropdownMenuItem>
                      {emailEnabled && contact.status !== "disabled" && <ResendInviteItem contact={contact} />}
                      {contact.status === "disabled" ? (
                        <EnableItem contact={contact} />
                      ) : (
                        <DropdownMenuItem onClick={() => openDialog({ kind: "disable", contact })}>
                          <PowerIcon />
                          Desativar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => openDialog({ kind: "delete", contact })}>
                        <Trash2Icon />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            Endereço do portal: <span className="font-medium text-foreground">{portalUrl}</span>
          </span>
          <Hint label="Copiar o endereço do portal">
            <Button variant="ghost" size="icon-xs" aria-label="Copiar o endereço do portal" onClick={copyPortalUrl}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </Hint>
        </div>
      </CardContent>

      {dialog?.kind === "form" && (
        <ContactFormDialog
          key={openings}
          open={open}
          onOpenChange={setOpen}
          clientId={clientId}
          contact={dialog.contact}
          emailEnabled={emailEnabled}
        />
      )}
      {dialog?.kind === "disable" && <DisableDialog open={open} onOpenChange={setOpen} contact={dialog.contact} />}
      {dialog?.kind === "delete" && <DeleteDialog open={open} onOpenChange={setOpen} contact={dialog.contact} />}
    </Card>
  );
}

function showResult(result: PortalActionResult | null, fallback: string) {
  if (!result) {
    toast.error(fallback);
    return false;
  }
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  if (result.warning) toast.warning(result.message, { description: result.warning });
  else toast.success(result.message);
  return true;
}

function ResendInviteItem({ contact }: { contact: PortalContactRow }) {
  const [isPending, startTransition] = useTransition();
  return (
    <DropdownMenuItem
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          showResult(await resendPortalInvite({ contactId: contact.id }).catch(() => null), "Não foi possível enviar o convite.");
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
      {contact.invited || contact.lastSignIn ? "Reenviar convite" : "Enviar convite"}
    </DropdownMenuItem>
  );
}

function EnableItem({ contact }: { contact: PortalContactRow }) {
  const [isPending, startTransition] = useTransition();
  return (
    <DropdownMenuItem
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          showResult(
            await setPortalContactDisabled({ contactId: contact.id, disabled: false }).catch(() => null),
            "Não foi possível reativar.",
          );
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <PowerIcon />}
      Reativar
    </DropdownMenuItem>
  );
}

type FieldErrors = Record<string, string[] | undefined>;

function ContactFormDialog({
  open,
  onOpenChange,
  clientId,
  contact,
  emailEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  contact: PortalContactRow | null;
  emailEnabled: boolean;
}) {
  const editing = Boolean(contact);
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [sendInvite, setSendInvite] = useState(emailEnabled);
  const [canApprove, setCanApprove] = useState(contact?.canApprove ?? true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = contact
      ? updatePortalContactSchema.safeParse({ contactId: contact.id, name, email, canApprove })
      : createPortalContactSchema.safeParse({ clientId, name, email, canApprove, sendInvite: emailEnabled && sendInvite });
    if (!parsed.success) {
      setError(null);
      setFieldErrors(z.flattenError(parsed.error as z.ZodError).fieldErrors as FieldErrors);
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = contact
        ? await updatePortalContact({ contactId: contact.id, name, email, canApprove }).catch(() => null)
        : await createPortalContact({ clientId, name, email, canApprove, sendInvite: emailEnabled && sendInvite }).catch(
            () => null,
          );
      if (result && !result.ok) {
        setError(result.fieldErrors ? null : result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      if (showResult(result, "Não foi possível salvar o acesso.")) onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{contact ? `Editar ${contact.name}` : "Novo acesso ao portal"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Trocar o e-mail encerra as sessões abertas: a pessoa entra de novo com o e-mail novo."
                : "A pessoa entra no portal com este e-mail e um código que chega nele. Não há senha."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={!!fieldErrors.name}>
              <FieldLabel htmlFor="portal-contact-name">Nome</FieldLabel>
              <Input
                id="portal-contact-name"
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
              <FieldLabel htmlFor="portal-contact-email">E-mail</FieldLabel>
              <Input
                id="portal-contact-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="pessoa@cliente.com.br"
                aria-invalid={!!fieldErrors.email}
                disabled={isPending}
                autoComplete="off"
                spellCheck={false}
              />
              <FieldError>{fieldErrors.email?.[0]}</FieldError>
            </Field>
            <Field orientation="horizontal">
              <Switch id="portal-contact-approve" checked={canApprove} onCheckedChange={setCanApprove} disabled={isPending} />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="portal-contact-approve">Pode aprovar entregas</FieldLabel>
                <FieldDescription>Aprova ou pede alterações nos arquivos enviados para aprovação. Sem isso, só acompanha.</FieldDescription>
              </div>
            </Field>
            {!editing && emailEnabled && (
              <Field orientation="horizontal">
                <Switch id="portal-contact-invite" checked={sendInvite} onCheckedChange={setSendInvite} disabled={isPending} />
                <div className="grid gap-0.5">
                  <FieldLabel htmlFor="portal-contact-invite">Enviar convite por e-mail</FieldLabel>
                  <FieldDescription>Com o endereço do portal e como entrar.</FieldDescription>
                </div>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isPending} />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              {editing ? "Salvar alterações" : "Criar acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: PortalContactRow;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-warning/10 text-warning">
            <PowerIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Desativar o acesso de {contact.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A pessoa sai do portal na hora e não recebe mais o código de entrada. Dá para reativar depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const done = showResult(
                  await setPortalContactDisabled({ contactId: contact.id, disabled: true }).catch(() => null),
                  "Não foi possível desativar.",
                );
                if (done) onOpenChange(false);
              })
            }
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            Desativar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: PortalContactRow;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Excluir o acesso de {contact.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            O acesso sai de forma definitiva e a pessoa sai do portal. A exclusão fica registrada na auditoria do cliente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <HoldToConfirmButton
            label="Segure para excluir"
            pendingLabel="Excluindo..."
            icon={<Trash2Icon />}
            pending={isPending}
            onConfirm={() =>
              startTransition(async () => {
                const done = showResult(
                  await deletePortalContact({ contactId: contact.id }).catch(() => null),
                  "Não foi possível excluir.",
                );
                if (done) onOpenChange(false);
              })
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
