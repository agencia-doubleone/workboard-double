"use client";

import {
  HistoryIcon,
  KeyRoundIcon,
  LogOutIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { PASSWORD_RESET_EXPIRES_IN_HOURS, ROLE_LABELS } from "@/lib/users";
import { revokeUserSessions, sendPasswordReset, setUserActive } from "./actions";
import type { UserRow } from "./types";
import {
  ConfirmDialog,
  DeleteUserDialog,
  SetPasswordDialog,
  UserFormDialog,
} from "./user-dialogs";

const STATUS_FILTERS = {
  all: "Todos os status",
  active: "Ativos",
  inactive: "Inativos",
} as const;
type StatusFilter = keyof typeof STATUS_FILTERS;

type DialogKind = "create" | "edit" | "password" | "reset" | "deactivate" | "delete" | "sessions";
type DialogState = { kind: DialogKind; user: UserRow | null; open: boolean; key: number };

type UsersTableProps = {
  users: UserRow[];
  currentUserId: string;
  emailEnabled: boolean;
};

export function UsersTable({ users, currentUserId, emailEnabled }: UsersTableProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return users.filter((user) => {
      if (status === "active" && !user.active) return false;
      if (status === "inactive" && user.active) return false;
      return !term || normalize(`${user.name} ${user.email}`).includes(term);
    });
  }, [users, query, status]);

  // A chave muda a cada abertura para o formulário começar limpo; o estado
  // fica montado ao fechar para a animação de saída rodar.
  function openDialog(kind: DialogKind, user: UserRow | null = null) {
    setDialog((current) => ({ kind, user, open: true, key: (current?.key ?? 0) + 1 }));
  }
  function handleOpenChange(open: boolean) {
    if (!open) setDialog((current) => current && { ...current, open: false });
  }

  const activeCount = users.filter((user) => user.active).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar usuários"
          />
        </InputGroup>
        <Select
          items={STATUS_FILTERS}
          value={status}
          onValueChange={(value) => value && value in STATUS_FILTERS && setStatus(value as StatusFilter)}
        >
          <SelectTrigger className="sm:w-40" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((option) => (
              <SelectItem key={option} value={option}>
                {STATUS_FILTERS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums sm:ml-2">
          {users.length} {users.length === 1 ? "usuário" : "usuários"} · {activeCount} ativos
        </span>
        <Button className="sm:ml-auto" onClick={() => openDialog("create")}>
          <PlusIcon />
          Novo usuário
        </Button>
      </div>

      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sessões</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <UserTableRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUserId}
                emailEnabled={emailEnabled}
                onAction={openDialog}
              />
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>Nenhum usuário encontrado</EmptyTitle>
              <EmptyDescription>Ajuste a busca ou o filtro de status.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TableFrame>

      {dialog && (
        <UserDialogs
          key={dialog.key}
          dialog={dialog}
          isSelf={dialog.user?.id === currentUserId}
          onOpenChange={handleOpenChange}
        />
      )}
    </div>
  );
}

function UserTableRow({
  user,
  isSelf,
  emailEnabled,
  onAction,
}: {
  user: UserRow;
  isSelf: boolean;
  emailEnabled: boolean;
  onAction: (kind: DialogKind, user: UserRow) => void;
}) {
  const otherSessions = isSelf ? user.activeSessions - 1 : user.activeSessions;

  return (
    <TableRow className={cn(!user.active && "text-muted-foreground")}>
      <TableCell>
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} imageUrl={user.imageUrl} />
          <div className="grid min-w-0 leading-tight">
            <span className="flex items-center gap-2 truncate font-medium text-foreground">
              {user.name}
              {isSelf && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  Você
                </Badge>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={user.role === "admin" ? "soft" : "outline"}>
          {ROLE_LABELS[user.role]}
        </Badge>
      </TableCell>
      <TableCell>
        <StatusSwitch user={user} isSelf={isSelf} onDeactivate={() => onAction("deactivate", user)} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {user.activeSessions > 0 ? user.activeSessions : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {user.lastSignIn ? (
          <Hint label={user.lastSignIn.absolute}>
            <span className="cursor-default">{user.lastSignIn.relative}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">Nunca</span>
        )}
      </TableCell>
      <TableCell className="tabular-nums">{user.createdAt}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${user.name}`} />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onAction("edit", user)}>
              <PencilIcon />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("password", user)}>
              <KeyRoundIcon />
              Definir nova senha
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction("reset", user)}
              disabled={!emailEnabled || !user.active}
            >
              <MailIcon />
              {emailEnabled ? "Enviar link de redefinição" : "Link por e-mail (em breve)"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction("sessions", user)}
              disabled={otherSessions <= 0}
            >
              <LogOutIcon />
              {isSelf ? "Encerrar outras sessões" : "Encerrar sessões"}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href={`/auditoria?registro=${encodeURIComponent(`user:${user.id}`)}`} />}
            >
              <HistoryIcon />
              Ver histórico
            </DropdownMenuItem>
            {!isSelf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onAction("delete", user)}>
                  <Trash2Icon />
                  Excluir usuário
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/** Reativar é imediato; desativar pede confirmação (derruba as sessões). */
function StatusSwitch({
  user,
  isSelf,
  onDeactivate,
}: {
  user: UserRow;
  isSelf: boolean;
  onDeactivate: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [active, setOptimisticActive] = useOptimistic(user.active);

  function handleChange(checked: boolean) {
    if (!checked) {
      onDeactivate();
      return;
    }
    startTransition(async () => {
      setOptimisticActive(true);
      const result = await setUserActive({ userId: user.id, active: true });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  const hint = isSelf
    ? "Você não pode desativar a própria conta"
    : !active && user.banReason
      ? `Motivo: ${user.banReason}`
      : null;

  const control = (
    <span className="inline-flex items-center gap-2.5">
      <Switch
        checked={active}
        onCheckedChange={handleChange}
        disabled={isSelf || isPending}
        aria-label={`Acesso de ${user.name}`}
      />
      <span className={cn("text-sm", !active && "text-muted-foreground")}>
        {active ? "Ativo" : "Inativo"}
      </span>
    </span>
  );

  return hint ? <Hint label={hint}>{control}</Hint> : control;
}

function UserDialogs({
  dialog,
  isSelf,
  onOpenChange,
}: {
  dialog: DialogState;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { kind, user, open } = dialog;

  if (kind === "create") return <UserFormDialog open={open} onOpenChange={onOpenChange} />;
  if (!user) return null;

  switch (kind) {
    case "edit":
      return <UserFormDialog open={open} onOpenChange={onOpenChange} user={user} isSelf={isSelf} />;
    case "password":
      return <SetPasswordDialog open={open} onOpenChange={onOpenChange} user={user} isSelf={isSelf} />;
    case "reset":
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          title="Enviar link de redefinição?"
          description={
            <>
              {user.name} vai receber em <strong>{user.email}</strong> um link para criar uma
              nova senha, válido por {PASSWORD_RESET_EXPIRES_IN_HOURS} horas. Quando a senha for
              trocada, todas as sessões abertas serão encerradas.
            </>
          }
          confirmLabel="Enviar link"
          onConfirm={() => sendPasswordReset({ userId: user.id })}
        />
      );
    case "sessions":
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          title={isSelf ? "Encerrar suas outras sessões?" : "Encerrar sessões?"}
          description={
            isSelf
              ? "Você continua conectado aqui; os outros dispositivos precisarão entrar de novo."
              : `${user.name} será desconectado de todos os dispositivos e precisará entrar de novo.`
          }
          confirmLabel="Encerrar sessões"
          onConfirm={() => revokeUserSessions({ userId: user.id })}
        />
      );
    case "deactivate":
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          title={`Desativar ${user.name}?`}
          description="A pessoa perde o acesso imediatamente e todas as sessões abertas são encerradas. Dá para reativar depois."
          confirmLabel="Desativar"
          destructive
          reasonLabel="Motivo"
          onConfirm={(reason) => setUserActive({ userId: user.id, active: false, reason })}
        />
      );
    case "delete":
      return <DeleteUserDialog open={open} onOpenChange={onOpenChange} user={user} />;
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

