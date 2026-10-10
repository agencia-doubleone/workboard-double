"use client";

import { FileIcon, FolderSearchIcon, LockIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteUnregisteredFile, deleteUnusedFile, deleteUnusedFiles } from "./actions";
import type { FileView } from "./types";

/** Quantos lugares de uso aparecem na linha (o resto vira "+N"). */
const USES_SHOWN = 2;

export function FilesTable({ rows, filtered }: { rows: FileView[]; filtered: boolean }) {
  const [target, setTarget] = useState<FileView | null>(null);
  const [open, setOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderSearchIcon />
          </EmptyMedia>
          <EmptyTitle>{filtered ? "Nenhum arquivo com esses filtros" : "Nenhum arquivo enviado ainda"}</EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Mude a busca, a pasta ou a situação."
              : "Fotos, logos, anexos e imagens dos textos aparecem aqui assim que forem enviados."}
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
              <TableHead>Arquivo</TableHead>
              <TableHead>Pasta</TableHead>
              <TableHead className="text-right">Tamanho</TableHead>
              <TableHead>Envio</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <FileThumb file={row} />
                    <div className="flex min-w-0 flex-col">
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-72 truncate font-medium outline-none hover:underline focus-visible:underline"
                          title={row.name}
                        >
                          {row.name}
                        </a>
                      ) : (
                        <span className="font-medium text-muted-foreground">{row.name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{row.extension}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.folderLabel}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.size}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="tabular-nums" title={row.createdAt.absolute}>
                      {row.createdAt.label}
                    </span>
                    <span className="max-w-40 truncate text-xs text-muted-foreground">
                      {row.registered ? (row.uploadedBy ?? "Pessoa excluída") : "Sem registro de quem enviou"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <UsageCell file={row} />
                </TableCell>
                <TableCell>
                  {row.usage !== "used" && (
                    <Hint label="Excluir arquivo">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${row.name}`}
                        className="text-muted-foreground hover:text-destructive-ink"
                        onClick={() => {
                          setTarget(row);
                          setOpen(true);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </Hint>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      {target && <DeleteFileDialog open={open} onOpenChange={setOpen} file={target} />}
    </>
  );
}

function FileThumb({ file }: { file: FileView }) {
  if (file.thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arquivo do CDN
      <img src={file.thumbUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded-md border object-cover" />
    );
  }
  const Icon = file.private ? LockIcon : FileIcon;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
      <Icon className="size-4" />
    </span>
  );
}

/** Registrado, mas o arquivo não está no servidor: o link está quebrado. */
function MissingBadge() {
  return (
    <Hint label="O Workboard aponta para este arquivo, mas ele não está no servidor (o link está quebrado).">
      <Badge variant="destructive">Não está no servidor</Badge>
    </Hint>
  );
}

function UsageCell({ file }: { file: FileView }) {
  if (file.usage === "unregistered") {
    return (
      <div className="flex flex-col items-start gap-1">
        <Hint label="Está no servidor, mas o Workboard não tem registro dele: um envio que não terminou ou algo posto pelo FTP.">
          <Badge variant="destructive">Sem registro</Badge>
        </Hint>
        <span className="text-xs text-muted-foreground">O Workboard não sabe deste arquivo</span>
      </div>
    );
  }
  if (file.usage === "unused") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="flex flex-wrap gap-1">
          <Badge variant="warning">Sem uso</Badge>
          {file.missing && <MissingBadge />}
        </span>
        <span className="text-xs text-muted-foreground">Nada no sistema aponta para ele</span>
      </div>
    );
  }
  if (file.usage === "recent") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="flex flex-wrap gap-1">
          <Hint
            label={
              file.registered
                ? "Enviado há menos de 24 h: pode estar no rascunho de alguém, ainda não enviado."
                : "Chegou há menos de 24 h e ainda não tem registro: pode ser um envio terminando agora."
            }
          >
            <Badge variant="outline">{file.registered ? "Recente, sem uso" : "Recente, sem registro"}</Badge>
          </Hint>
          {file.missing && <MissingBadge />}
        </span>
        <span className="text-xs text-muted-foreground">
          {file.registered ? "Talvez num rascunho" : "Talvez um envio em andamento"}
        </span>
      </div>
    );
  }
  const extra = file.uses.length - USES_SHOWN;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap gap-1">
        <Badge variant="success">Em uso</Badge>
        {file.missing && <MissingBadge />}
      </span>
      <ul className="flex flex-col text-xs text-muted-foreground">
        {file.uses.slice(0, USES_SHOWN).map((use, index) => (
          <li key={index} className="max-w-64 truncate">
            {use.href ? (
              <Link href={use.href} className="outline-none hover:text-foreground hover:underline focus-visible:underline">
                {use.label}
              </Link>
            ) : (
              use.label
            )}
          </li>
        ))}
        {extra > 0 && <li>e mais {extra} {extra === 1 ? "lugar" : "lugares"}</li>}
      </ul>
    </div>
  );
}

function DeleteFileDialog({
  open,
  onOpenChange,
  file,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileView;
}) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await (file.registered
        ? deleteUnusedFile({ mediaId: file.id })
        : deleteUnregisteredFile({ key: file.key })
      ).catch(() => null);
      if (result?.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result?.error ?? "Não foi possível excluir o arquivo.");
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
          <AlertDialogTitle>Excluir {file.private ? "este arquivo privado" : `“${file.name}”`}?</AlertDialogTitle>
          <AlertDialogDescription>
            {!file.registered
              ? file.usage === "recent"
                ? "Ele chegou há menos de 24 horas e ainda não tem registro: pode ser um envio terminando agora. Excluído, sai do servidor de arquivos de vez."
                : "Ele está no servidor, mas o Workboard não tem registro dele (um envio que não terminou ou algo posto pelo FTP). Excluído, sai do servidor de arquivos de vez."
              : file.missing
                ? "O arquivo já não está no servidor: excluir só apaga o registro que apontava para ele."
                : file.usage === "recent"
                  ? "Ele foi enviado há menos de 24 horas e pode estar no rascunho de uma mensagem que alguém ainda vai mandar. Excluído, sai do servidor de arquivos de vez."
                  : "Nada no sistema usa este arquivo. Excluído, ele sai do servidor de arquivos de vez e o link deixa de funcionar."}
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

/** Limpeza geral: exclui todos os arquivos sem uso há mais de 24 h, em lotes, mostrando o andamento. */
export function CleanupButton({ count, size }: { count: number; size: string }) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      let deleted = 0;
      let failed = 0;
      setProgress(0);
      // Lote a lote até acabar; para se um lote inteiro falhar (ex.: CDN fora do ar).
      for (;;) {
        const result = await deleteUnusedFiles().catch(() => null);
        if (!result?.ok) {
          toast.error(result?.error ?? "Não foi possível excluir os arquivos.");
          break;
        }
        deleted += result.deleted;
        failed = result.failed;
        setProgress(deleted);
        if (result.remaining === 0 || result.deleted === 0) break;
      }
      setProgress(null);
      setOpen(false);
      if (deleted > 0) toast.success(`${deleted} ${deleted === 1 ? "arquivo excluído" : "arquivos excluídos"}.`);
      if (failed > 0) toast.error(`${failed} não puderam ser excluídos. Tente de novo mais tarde.`);
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2Icon data-icon="inline-start" />
        Excluir {count} sem uso
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Excluir {count} {count === 1 ? "arquivo sem uso" : "arquivos sem uso"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`Libera ${size} no servidor de arquivos, entre os sem uso e os sem registro. Os que chegaram nas últimas 24 horas ficam (podem estar em rascunhos ou envios em andamento), e cada um é conferido de novo antes de sair. A exclusão é definitiva.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {progress !== null && (
            <p className="text-sm text-muted-foreground tabular-nums" role="status">
              Excluindo… {progress} de {count}
            </p>
          )}
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
    </>
  );
}
