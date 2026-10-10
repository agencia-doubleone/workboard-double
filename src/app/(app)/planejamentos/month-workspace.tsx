"use client";

import {
  ChevronDownIcon,
  ClipboardPasteIcon,
  CopyIcon,
  EllipsisIcon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  NotebookPenIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import { isApprovedStatus, PLANNING_LIMITS, PLANNING_STATUSES, PLANNING_STATUS_KEYS, SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { deleteMonthPosts, deletePost, setAllPostsStatus, setConcept, setMonthStatus, setPostStatus } from "./actions";
import { ImportDialog } from "./import-dialog";
import { ApprovalProgress, FORMAT_ICONS, NetworkIcon } from "./planning-ui";
import { PlanningStatusSelect } from "./planning-status-select";
import { PostEditor } from "./post-editor";
import type { MonthView, PostView } from "./types";

type Props = {
  planningId: string;
  month: MonthView;
  posts: PostView[];
  goal: number | null;
  defaultNetwork: SocialNetwork | null;
};

/** Um mês do planejamento: status, conceito, posts e as ações (colar do Word, novo post, em lote). */
export function MonthWorkspace({ planningId, month, posts, goal, defaultNetwork }: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; post: PostView | null; key: number }>({ open: false, post: null, key: 0 });
  const [deleteTarget, setDeleteTarget] = useState<PostView | "all" | null>(null);
  const [isPending, startTransition] = useTransition();
  const approved = posts.filter((post) => isApprovedStatus(post.status)).length;

  function openEditor(post: PostView | null) {
    setEditor((current) => ({ open: true, post, key: current.key + 1 }));
  }

  function setAll(status: (typeof PLANNING_STATUS_KEYS)[number]) {
    startTransition(async () => {
      const result = await setAllPostsStatus({ planningId, month: month.month, status }).catch(() => null);
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.error ?? "Não foi possível mudar os posts.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card p-3 shadow-raised">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status do mês</span>
          <PlanningStatusSelect
            label="Status do mês"
            celebrateDone
            value={month.status}
            onSave={(status) => setMonthStatus({ planningId, month: month.month, status })}
          />
        </div>
        <ApprovalProgress approved={approved} total={posts.length} goal={goal} />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <ClipboardPasteIcon data-icon="inline-start" />
            Colar do Word
          </Button>
          <Button onClick={() => openEditor(null)}>
            <PlusIcon data-icon="inline-start" />
            Novo post
          </Button>
          {posts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label="Mais ações do mês" disabled={isPending} />}
              >
                {isPending ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ListChecksIcon />
                    Todos os posts como...
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {PLANNING_STATUS_KEYS.map((status) => (
                      <DropdownMenuItem key={status} onClick={() => setAll(status)}>
                        <Badge variant={PLANNING_STATUSES[status].badge}>{PLANNING_STATUSES[status].label}</Badge>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget("all")}>
                  <Trash2Icon />
                  Excluir todos os posts do mês
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ConceptCard planningId={planningId} month={month} />

      {posts.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPenIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum post em {month.label}</EmptyTitle>
            <EmptyDescription>
              Cole o documento do Word para separar os posts automaticamente, ou cadastre um a um.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button variant="soft" onClick={() => setImportOpen(true)}>
              <ClipboardPasteIcon data-icon="inline-start" />
              Colar do Word
            </Button>
            <Button variant="outline" onClick={() => openEditor(null)}>
              <PlusIcon data-icon="inline-start" />
              Novo post
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ol className="flex flex-col gap-3">
          {posts.map((post, index) => (
            <li key={post.id}>
              <PostCard
                post={post}
                index={index + 1}
                onEdit={() => openEditor(post)}
                onDelete={() => setDeleteTarget(post)}
              />
            </li>
          ))}
        </ol>
      )}

      {month.document && (
        <details className="group rounded-xl border bg-card shadow-raised">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <FileTextIcon className="size-4 text-muted-foreground" />
            Documento original
            <span className="text-xs font-normal text-muted-foreground">o texto colado do Word</span>
            <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t px-4 py-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {month.document}
          </pre>
        </details>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        planningId={planningId}
        month={month.month}
        monthLabel={month.label}
        existingPosts={posts.length}
        hasConcept={Boolean(month.concept)}
        defaultNetwork={defaultNetwork}
      />
      <PostEditor
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        planningId={planningId}
        month={month.month}
        post={editor.post}
        defaultNetwork={defaultNetwork}
      />
      <DeletePostsDialog
        target={deleteTarget}
        count={posts.length}
        monthLabel={month.label}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget === "all"
            ? deleteMonthPosts({ planningId, month: month.month })
            : deleteTarget
              ? deletePost({ postId: deleteTarget.id })
              : Promise.resolve(null)
        }
      />
    </div>
  );
}

/** Conceito editorial do mês, com edição no lugar. */
function ConceptCard({ planningId, month }: { planningId: string; month: MonthView }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(month.concept ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setConcept({ planningId, month: month.month, concept: text }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível salvar.");
        return;
      }
      setEditing(false);
    });
  }

  if (!editing && !month.concept) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <SparklesIcon className="size-4" />
        Adicionar o conceito editorial de {month.label}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-primary-soft/40 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <SparklesIcon className="size-4 text-primary-ink" />
          Conceito do mês
        </h3>
        {!editing && (
          <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
            <PencilIcon data-icon="inline-start" />
            Editar
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Conceito do mês"
            className="max-h-80 min-h-24 bg-background"
            maxLength={PLANNING_LIMITS.concept}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setText(month.concept ?? "");
                setEditing(false);
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{month.concept}</p>
      )}
    </section>
  );
}

function PostCard({ post, index, onEdit, onDelete }: { post: PostView; index: number; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const FormatIcon = FORMAT_ICONS[post.formatKind];
  const longCopy = post.copy.split("\n").length > 6 || post.copy.length > 600;

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(post.copy);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-raised">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">{index}</span>
        <span className={cn("text-sm font-medium tabular-nums", !post.dateLabel && "text-muted-foreground")}>
          {post.dateLabel ?? "Sem data"}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {post.network && (
            <span className="flex items-center gap-1" title={SOCIAL_NETWORKS[post.network]}>
              <NetworkIcon network={post.network} />
            </span>
          )}
          {post.format && (
            <span className="flex items-center gap-1">
              <FormatIcon className="size-3.5" />
              {post.format}
            </span>
          )}
        </span>
        {post.topic && (
          <span className="max-w-64 truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">
            {post.topic}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <PlanningStatusSelect label="Status do post" value={post.status} onSave={(status) => setPostStatus({ postId: post.id, status })} />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ações do post" />}>
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyCaption} disabled={!post.copy}>
                <CopyIcon />
                Copiar legenda
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <button type="button" onClick={onEdit} className="text-left text-base leading-snug font-semibold outline-none hover:underline focus-visible:underline">
        {post.headline || <span className="text-muted-foreground">Sem headline</span>}
      </button>

      {post.copy && (
        <div className="flex flex-col gap-1">
          <p className={cn("text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground", !expanded && longCopy && "line-clamp-6")}>
            {post.copy}
          </p>
          {longCopy && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="self-start text-xs font-medium text-primary-ink outline-none hover:underline focus-visible:underline"
            >
              {expanded ? "Ver menos" : "Ver a legenda inteira"}
            </button>
          )}
        </div>
      )}

      {post.sections.length > 0 && (
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Detalhes
            <span className="truncate font-normal">{post.sections.map((section) => section.label).join(" · ")}</span>
            <ChevronDownIcon className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="flex flex-col gap-3 border-t px-3 py-3">
            {post.sections.map((section, position) => (
              <div key={position} className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-muted-foreground">{section.label}</dt>
                <dd className="text-sm leading-relaxed whitespace-pre-wrap">{section.text}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </article>
  );
}

function DeletePostsDialog({
  target,
  count,
  monthLabel,
  onClose,
  onConfirm,
}: {
  target: PostView | "all" | null;
  count: number;
  monthLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<{ ok: true; message: string } | { ok: false; error: string } | null>;
}) {
  const [isPending, startTransition] = useTransition();
  const all = target === "all";

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm().catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível excluir.");
        return;
      }
      toast.success(result.message);
      onClose();
    });
  }

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && !isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>{all ? `Excluir os ${count} posts de ${monthLabel}?` : "Excluir este post?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {all
              ? "Os posts saem de vez. O conceito, o status do mês e o documento original continuam."
              : target?.headline
                ? `"${target.headline}" sai do planejamento de vez.`
                : "O post sai do planejamento de vez."}
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
