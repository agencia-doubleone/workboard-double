"use client";

import {
  BracesIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EllipsisIcon,
  EyeIcon,
  ImagePlusIcon,
  ImagesIcon,
  MessageSquareReplyIcon,
  SendIcon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  NotebookPenIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { HoldToConfirmButton } from "@/components/hold-to-confirm-button";
import { MediaLightbox } from "@/components/media-lightbox";
import { detailsSummaryClass, PostCardInfo, PostTextContent } from "@/components/planning/post-text";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  canUploadArt,
  composeCaption,
  isApprovedStatus,
  isArtShared,
  isPostLocked,
  PLANNING_LIMITS,
  PLANNING_STATUSES,
  PLANNING_STATUS_KEYS,
  parsePostStatusValue,
  postStageOf,
  postStatusValue,
  STAGED_POST_STATUS_VALUES,
  type ApprovalStage,
  type PostStatusValue,
  type SocialNetwork,
} from "@/lib/planning";
import {
  approvePostBriefs,
  deleteMonthPosts,
  deletePost,
  setAllPostsStatus,
  setConcept,
  setMonthStatus,
  setPostStatus,
  undoPostBriefApproval,
  withdrawPostForEditing,
} from "./actions";
import { PendingSends, RegisterDecisionDialog, SendForApprovalDialog, sendablePosts } from "./approval-dialogs";
import { CopyPromptButton } from "./copy-prompt-button";
import { ImportDialog } from "./import-dialog";
import { ApprovalProgress } from "./planning-ui";
import { PlanningStatusSelect, PostStatusSelect } from "./planning-status-select";
import { PostArtDialog } from "./post-art-dialog";
import { ArtTile } from "./post-art-editor";
import { PostEditor } from "./post-editor";
import type { MonthView, PendingSendView, PostView } from "./types";

type Props = {
  planningId: string;
  month: MonthView;
  posts: PostView[];
  goal: number | null;
  defaultNetwork: SocialNetwork | null;
  /** O planejamento tem "Aprovar pauta". */
  approvesBrief: boolean;
  isAdmin: boolean;
  uploadsEnabled: boolean;
  /** A prévia do mês como o cliente vê (apresentação, feed e lista). */
  previewHref: string;
  /** Envios ao cliente que esperam resposta. */
  pendingSends: PendingSendView[];
};

/** Um mês do planejamento: status, conceito, posts e as ações (importar JSON, novo post, em lote). */
export function MonthWorkspace({
  planningId,
  month,
  posts,
  goal,
  defaultNetwork,
  approvesBrief,
  isAdmin,
  uploadsEnabled,
  previewHref,
  pendingSends,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; post: PostView | null; key: number }>({ open: false, post: null, key: 0 });
  const [deleteTarget, setDeleteTarget] = useState<PostView | "all" | null>(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [sendDialog, setSendDialog] = useState<{ open: boolean; key: number; stage: ApprovalStage }>({ open: false, key: 0, stage: "arte" });
  const [decisionTarget, setDecisionTarget] = useState<PostView | null>(null);
  const sendableBriefs = approvesBrief ? sendablePosts(posts, true, "pauta").length : 0;
  const sendableArts = sendablePosts(posts, approvesBrief, "arte").length;
  const openSend = (stage: ApprovalStage) => setSendDialog((current) => ({ open: true, key: current.key + 1, stage }));
  const [isPending, startTransition] = useTransition();
  const approved = posts.filter((post) => isApprovedStatus(post.status)).length;
  const briefsToApprove = approvesBrief ? posts.filter((post) => post.briefState !== "aprovada") : [];

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
          <CopyPromptButton month={month.month} variant="ghost" />
          {posts.length > 0 && approvesBrief && (
            <Hint
              label={
                sendableBriefs > 0
                  ? "O cliente aprova o texto dos posts pelo portal, antes das artes"
                  : "Nenhuma pauta para enviar: as em rascunho ou com alteração ajustada aparecem aqui"
              }
            >
              <span>
                <Button variant="soft" disabled={sendableBriefs === 0} onClick={() => openSend("pauta")}>
                  <NotebookPenIcon data-icon="inline-start" />
                  Enviar pauta
                  {sendableBriefs > 0 && <span className="tabular-nums opacity-70">{sendableBriefs}</span>}
                </Button>
              </span>
            </Hint>
          )}
          {posts.length > 0 && (
            <Hint
              label={
                sendableArts > 0
                  ? "O cliente aprova as artes pelo portal (apresentação e feed)"
                  : approvesBrief
                    ? "Nenhuma arte para enviar: aparecem aqui os posts com arte e a pauta aprovada"
                    : "Nenhuma arte para enviar: suba as artes nos posts"
              }
            >
              <span>
                <Button variant="soft" disabled={sendableArts === 0} onClick={() => openSend("arte")}>
                  <ImagesIcon data-icon="inline-start" />
                  Enviar artes
                  {sendableArts > 0 && <span className="tabular-nums opacity-70">{sendableArts}</span>}
                </Button>
              </span>
            </Hint>
          )}
          {posts.length > 0 && (
            <Hint label="Como o cliente vai ver: apresentação, feed e lista">
              <Link href={previewHref} className={buttonVariants({ variant: "outline" })}>
                <EyeIcon data-icon="inline-start" />
                Prévia
              </Link>
            </Hint>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <BracesIcon data-icon="inline-start" />
            Importar JSON
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
                {isAdmin && briefsToApprove.length > 0 && (
                  <>
                    <DropdownMenuItem onClick={() => setApproveAllOpen(true)}>
                      <CheckCheckIcon />
                      Aprovar as pautas do mês
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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

      <PendingSends planningId={planningId} month={month.month} sends={pendingSends} />

      <ConceptCard planningId={planningId} month={month} />

      {posts.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPenIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum post em {month.label}</EmptyTitle>
            <EmptyDescription>
              Importe o JSON do planejamento (o prompt converte o Word nele) ou cadastre os posts um a um.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Button variant="soft" onClick={() => setImportOpen(true)}>
              <BracesIcon data-icon="inline-start" />
              Importar JSON
            </Button>
            <CopyPromptButton month={month.month} />
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
                planningId={planningId}
                approvesBrief={approvesBrief}
                isAdmin={isAdmin}
                onEdit={() => openEditor(post)}
                onDelete={() => setDeleteTarget(post)}
                onRegisterDecision={() => setDecisionTarget(post)}
                uploadsEnabled={uploadsEnabled}
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
            <span className="text-xs font-normal text-muted-foreground">o texto colado do Word, antes do JSON</span>
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
        lockedPosts={posts.filter(isPostLocked).length}
      />
      <PostEditor
        // Irmãos com chave: cada dialog com o próprio prefixo (senão as chaves "0" colidem).
        key={`editor-${editor.key}`}
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        planningId={planningId}
        month={month.month}
        post={editor.post}
        defaultNetwork={defaultNetwork}
        approvesBrief={approvesBrief}
        isAdmin={isAdmin}
        uploadsEnabled={uploadsEnabled}
      />
      <SendForApprovalDialog
        key={`send-${sendDialog.key}`}
        open={sendDialog.open}
        onOpenChange={(open) => setSendDialog((current) => ({ ...current, open }))}
        planningId={planningId}
        month={month.month}
        monthLabel={month.label}
        posts={posts}
        approvesBrief={approvesBrief}
        stage={sendDialog.stage}
      />
      <RegisterDecisionDialog
        target={decisionTarget}
        planningId={planningId}
        approvesBrief={approvesBrief}
        onClose={() => setDecisionTarget(null)}
      />
      <ApproveBriefsDialog
        open={approveAllOpen}
        onOpenChange={setApproveAllOpen}
        planningId={planningId}
        posts={briefsToApprove}
        monthLabel={month.label}
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

function PostCard({
  post,
  index,
  planningId,
  approvesBrief,
  isAdmin,
  onEdit,
  onDelete,
  onRegisterDecision,
  uploadsEnabled,
}: {
  post: PostView;
  index: number;
  planningId: string;
  approvesBrief: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRegisterDecision: () => void;
  uploadsEnabled: boolean;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [artDialog, setArtDialog] = useState({ open: false, key: 0 });
  // Com "Aprovar pauta", o status vem com a etapa; quem não é admin não troca de etapa.
  const stage = postStageOf({ approvesBrief }, post);
  const statusOptions: readonly PostStatusValue[] = stage
    ? STAGED_POST_STATUS_VALUES.filter((value) => isAdmin || !value.includes(":") || value.startsWith(`${stage}:`))
    : PLANNING_STATUS_KEYS;
  // Com o cliente esperando resposta, a arte fica travada (retire do envio para mexer).
  const showArtButton = !post.waiting;
  const canAddArt = canUploadArt({ approvesBrief }, { briefState: post.briefState, hasArt: post.art.length > 0 });
  const openArtDialog = () => setArtDialog((current) => ({ open: true, key: current.key + 1 }));
  const [isPending, startTransition] = useTransition();
  const caption = composeCaption(post);

  function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action().catch(() => null);
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.error ?? "Não foi possível concluir.");
    });
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success("Legenda copiada (copy, CTA e hashtags).");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    // Texto sem espaço (link, palavra colada) quebra em qualquer ponto, sem empurrar o card.
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-raised wrap-anywhere">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PostCardInfo post={post} index={index} />
        <div className="ml-auto flex items-center gap-1">
          <PostStatusSelect
            value={postStatusValue(stage, post.status)}
            options={statusOptions}
            onSave={(value) => {
              const parsed = parsePostStatusValue(value)!;
              return setPostStatus({ postId: post.id, status: parsed.status, stage: parsed.stage ?? undefined });
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Ações do post" disabled={isPending} />}
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon />
                Editar
              </DropdownMenuItem>
              {isAdmin && approvesBrief && post.briefState !== "aprovada" && (
                <DropdownMenuItem onClick={() => run(() => approvePostBriefs({ planningId, postIds: [post.id] }))}>
                  <CheckIcon />
                  Aprovar a pauta
                </DropdownMenuItem>
              )}
              {post.waiting && (
                <DropdownMenuItem onClick={() => run(() => withdrawPostForEditing({ postId: post.id }))}>
                  <UndoIcon />
                  Retirar do envio para editar
                </DropdownMenuItem>
              )}
              {isAdmin && (approvesBrief || post.art.length > 0) && (
                <DropdownMenuItem onClick={onRegisterDecision}>
                  <MessageSquareReplyIcon />
                  Registrar resposta do cliente
                </DropdownMenuItem>
              )}
              {isAdmin && approvesBrief && post.briefState === "aprovada" && !isArtShared(post.artState) && (
                <DropdownMenuItem onClick={() => run(() => undoPostBriefApproval({ postId: post.id }))}>
                  <UndoIcon />
                  Desfazer a aprovação da pauta
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={copyCaption} disabled={!caption}>
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

      {post.waiting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <SendIcon className="size-3.5 text-warning" />
          Com o cliente, esperando a resposta da {post.waiting === "pauta" ? "pauta" : "arte"}. Para editar, retire do envio.
        </p>
      )}
      {post.changesRequest && (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <span className="text-xs font-medium text-destructive-ink">
            {post.changesRequest.byName} pediu alteração na {post.changesRequest.stage === "pauta" ? "pauta" : "arte"} em{" "}
            {post.changesRequest.dateLabel}
          </span>
          <p className="leading-relaxed whitespace-pre-wrap">{post.changesRequest.comment}</p>
        </div>
      )}
      {post.art.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {post.art.map((item, position) => (
            <li key={item.mediaId} className="w-16">
              <ArtTile
                item={{ ...item, status: "done", progress: 1 }}
                index={post.art.length > 1 && item.role === "art" ? position + 1 : null}
                onOpen={() => setLightbox(position)}
              />
            </li>
          ))}
          {showArtButton && uploadsEnabled && (
            <li className="w-16">
              <Hint label="Adicionar, trocar ou reordenar as artes">
                <button
                  type="button"
                  onClick={openArtDialog}
                  aria-label="Editar as artes"
                  className="flex aspect-[4/5] w-full items-center justify-center rounded-md border border-dashed text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ImagePlusIcon className="size-4" />
                </button>
              </Hint>
            </li>
          )}
        </ul>
      ) : (
        showArtButton &&
        uploadsEnabled && (
          <Hint label={canAddArt ? "Subir a arte deste post" : "Neste planejamento, a arte sobe depois da pauta aprovada"}>
            <span className="w-fit">
              <Button variant="outline" size="sm" onClick={openArtDialog} disabled={!canAddArt}>
                <ImagePlusIcon data-icon="inline-start" />
                Adicionar arte
              </Button>
            </span>
          </Hint>
        )
      )}
      {artDialog.key > 0 && (
        <PostArtDialog
          key={`art-${artDialog.key}`}
          open={artDialog.open}
          onOpenChange={(open) => setArtDialog((current) => ({ ...current, open }))}
          post={post}
          isAdmin={isAdmin}
          uploadsEnabled={uploadsEnabled}
        />
      )}
      <MediaLightbox
        items={post.art.map((item) => ({
          id: item.mediaId,
          url: item.url,
          name: item.role === "cover" ? `Capa · ${item.name}` : item.name,
          kind: item.kind,
        }))}
        index={lightbox}
        onIndexChange={setLightbox}
      />

      <PostTextContent post={post} onHeadlineClick={onEdit} />
      {post.notes && (
        <details className="group rounded-lg border">
          <summary className={detailsSummaryClass}>
            Observações
            <span className="truncate font-normal">do formato antigo</span>
            <ChevronDownIcon className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="border-t px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">{post.notes}</p>
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

/** Admins registram de uma vez a aprovação das pautas do mês (o cliente aprovou por fora). */
function ApproveBriefsDialog({
  open,
  onOpenChange,
  planningId,
  posts,
  monthLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningId: string;
  posts: PostView[];
  monthLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const count = posts.length;

  function handleConfirm() {
    startTransition(async () => {
      const result = await approvePostBriefs({ planningId, postIds: posts.map((post) => post.id) }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível aprovar as pautas.");
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-success/12 text-success-ink">
            <CheckCheckIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Aprovar {count === 1 ? "a pauta que falta" : `as ${count} pautas que faltam`} em {monthLabel}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Para quando o cliente aprovou por fora: fica registrado que a equipe aprovou em nome dele, e as artes já podem subir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            Aprovar {count === 1 ? "a pauta" : `${count} pautas`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
