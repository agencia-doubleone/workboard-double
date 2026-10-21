"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  HistoryIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
} from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { Hint } from "@/components/hint";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  canUploadArt,
  DEFAULT_POST_KIND,
  isPostKind,
  isSocialNetwork,
  keepValidArt,
  parseHashtags,
  PLANNING_LIMITS,
  POST_KIND_KEYS,
  POST_KINDS,
  SOCIAL_NETWORK_KEYS,
  SOCIAL_NETWORKS,
  type ApprovalStage,
  type PostKind,
  type SocialNetwork,
} from "@/lib/planning";
import { approvePostBriefs, savePost, withdrawPostForEditing } from "./actions";
import { PostArtSection, useArtDrafts } from "./post-art-editor";
import type { PostHistoryItem, PostView } from "./types";

type SlideDraft = { headline: string; supportText: string };

type Draft = {
  date: string;
  network: SocialNetwork | null;
  kind: PostKind;
  headline: string;
  supportText: string;
  copy: string;
  cta: string;
  /** Texto do campo ("#a #b"); vira lista ao salvar. */
  hashtags: string;
  slides: SlideDraft[];
  scenes: string[];
  notes: string;
};

const NO_NETWORK = "nenhuma";
const KIND_ITEMS = Object.fromEntries(POST_KIND_KEYS.map((kind) => [kind, POST_KINDS[kind].label]));

function toDraft(post: PostView | null, defaultNetwork: SocialNetwork | null): Draft {
  return {
    date: post?.date ?? "",
    network: post ? post.network : defaultNetwork,
    kind: post?.kind ?? DEFAULT_POST_KIND,
    headline: post?.headline ?? "",
    supportText: post?.supportText ?? "",
    copy: post?.copy ?? "",
    cta: post?.cta ?? "",
    hashtags: post?.hashtags.join(" ") ?? "",
    slides: post?.slides.map((slide) => ({ headline: slide.headline ?? "", supportText: slide.supportText ?? "" })) ?? [],
    scenes: post?.scenes.map((scene) => scene.text) ?? [],
    notes: post?.notes ?? "",
  };
}

/** O que pede confirmação antes de salvar: aprovações que saem (D5) e artes que não valem para o tipo novo. */
export type Confirmation = { stages: ApprovalStage[]; droppedArt: number };

const STAGE_TEXT: Record<ApprovalStage, string> = { pauta: "a pauta", arte: "a arte" };

/** Cria (post = null) ou edita um post do mês, com os campos do JSON padrão e as artes. */
export function PostEditor({
  open,
  onOpenChange,
  planningId,
  month,
  post,
  defaultNetwork,
  approvesBrief,
  isAdmin,
  uploadsEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningId: string;
  month: string;
  post: PostView | null;
  defaultNetwork: SocialNetwork | null;
  /** O planejamento tem "Aprovar pauta". */
  approvesBrief: boolean;
  isAdmin: boolean;
  uploadsEnabled: boolean;
}) {
  const id = useId();
  const [initial] = useState(() => toDraft(post, defaultNetwork));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const [isApproving, startApproving] = useTransition();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // A pauta aprovada aqui mesmo (pelo botão do aviso) libera a arte sem fechar o editor.
  const [briefApproved, setBriefApproved] = useState(false);
  const saved = useRef(false);
  // Com o cliente esperando resposta, o que ele vê fica travado até a equipe retirar o post do envio (D11).
  const [waiting, setWaiting] = useState(post?.waiting ?? null);
  const [isWithdrawing, startWithdrawing] = useTransition();

  function withdraw() {
    if (!post) return;
    startWithdrawing(async () => {
      const result = await withdrawPostForEditing({ postId: post.id }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível retirar do envio.");
        return;
      }
      setWaiting(null);
      toast.success(result.message);
    });
  }
  // Observações só existem nos posts do formato antigo: o campo aparece para editar ou apagar.
  const [hasNotes] = useState(() => Boolean(post?.notes));
  const networkItems = { [NO_NETWORK]: "Sem rede", ...SOCIAL_NETWORKS };
  const parts = POST_KINDS[draft.kind].parts;
  const art = useArtDrafts(post?.art ?? []);
  const kept = keepValidArt(draft.kind, art.items);
  const dropped = art.items.filter((item) => !kept.includes(item));
  const briefState = briefApproved ? "aprovada" : (post?.briefState ?? "rascunho");
  const canUpload = canUploadArt({ approvesBrief }, { briefState, hasArt: (post?.art.length ?? 0) > 0 });
  const textChanged = JSON.stringify(draft) !== JSON.stringify(initial);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function close(next: boolean) {
    // Fechou sem salvar: o que subiu agora sai do CDN.
    if (!next && !saved.current) art.discardFresh();
    onOpenChange(next);
  }

  function approveBrief() {
    if (!post) return;
    startApproving(async () => {
      const result = await approvePostBriefs({ planningId, postIds: [post.id] }).catch(() => null);
      if (!result?.ok) {
        toast.error(result && !result.ok ? result.error : "Não foi possível aprovar a pauta.");
        return;
      }
      setBriefApproved(true);
      toast.success(result.message);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    save();
  }

  /** `approval`: a resposta à confirmação do D5; `confirmed`: as artes que saem já foram confirmadas. */
  function save(approval?: "keep" | "drop", confirmed = false) {
    if (art.uploading) {
      toast.error("Espere as artes terminarem de subir.");
      return;
    }
    // Arte que estava no post e sai por causa do tipo novo pede confirmação (a que subiu agora, não).
    const droppedArt = dropped.filter((item) => !item.fresh).length;
    if (droppedArt && !confirmed) {
      setConfirmation({ stages: [], droppedArt });
      return;
    }
    setConfirmation(null);
    startTransition(async () => {
      const result = await savePost({
        planningId,
        month,
        postId: post?.id,
        date: draft.date || null,
        network: draft.network,
        kind: draft.kind,
        headline: draft.headline,
        supportText: draft.supportText,
        copy: draft.copy,
        cta: draft.cta,
        hashtags: parseHashtags(draft.hashtags),
        slides: draft.slides,
        scenes: draft.scenes.map((text) => ({ text })),
        notes: hasNotes ? draft.notes : undefined,
        art: kept.flatMap((item) => (item.status === "done" && item.mediaId ? [{ mediaId: item.mediaId, role: item.role }] : [])),
        approval,
      }).catch(() => null);
      if (result && !result.ok && result.needsApproval) {
        setConfirmation({ stages: result.needsApproval, droppedArt: 0 });
        return;
      }
      if (!result?.ok) {
        setErrors(result && !result.ok ? (result.fieldErrors ?? {}) : {});
        toast.error(result && !result.ok ? result.error : "Não foi possível salvar o post.");
        return;
      }
      saved.current = true;
      // O que subiu agora e não valeu para o tipo sai do CDN.
      dropped.filter((item) => item.fresh).forEach(art.discard);
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  const locked = canUpload ? null : (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-3">
      <LockIcon className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {post
          ? "A pauta deste post ainda não foi aprovada. Neste planejamento, a arte sobe depois da pauta aprovada."
          : "Neste planejamento, a arte sobe depois da pauta aprovada. Crie o post e aprove a pauta."}
      </p>
      {post && isAdmin && (
        <Hint label={textChanged ? "Salve as mudanças do texto antes de aprovar." : "O cliente aprovou por fora: registra a aprovação em nome dele."}>
          <span>
            <Button type="button" variant="soft" size="sm" onClick={approveBrief} disabled={isApproving || textChanged}>
              {isApproving ? <Loader2Icon className="animate-spin" /> : <CheckIcon data-icon="inline-start" />}
              Aprovar a pauta
            </Button>
          </span>
        </Hint>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // O Esc de um arrasto de arte cancela só o arrasto.
        if (!next && details.reason === "escape-key" && art.isDragging()) {
          details.cancel();
          return;
        }
        close(next);
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post ? "Editar post" : "Novo post"}</DialogTitle>
          <DialogDescription>
            {approvesBrief && post?.briefDecision && briefState === "aprovada"
              ? `Pauta aprovada${post.briefDecision.side === "team" ? " pela equipe" : ""} por ${post.briefDecision.byName} em ${post.briefDecision.dateLabel}. Mudar a headline, o texto de apoio, os slides ou o roteiro tira a aprovação.`
              : "Os mesmos campos do JSON padrão. “Copiar legenda” junta a copy, o CTA e as hashtags."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="-mx-5 flex min-h-0 flex-col overflow-y-auto px-5">
          {waiting && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-warning/5 px-3 py-3">
              <SendIcon className="size-4 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-sm">
                Este post está com o cliente, esperando a resposta da {waiting === "pauta" ? "pauta" : "arte"}. Para editar, retire do envio:
                o resto do envio continua com ele.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={withdraw} disabled={isWithdrawing}>
                {isWithdrawing ? <Loader2Icon className="animate-spin" /> : <UndoIcon data-icon="inline-start" />}
                Retirar do envio para editar
              </Button>
            </div>
          )}
          <fieldset disabled={Boolean(waiting)} className="min-w-0 disabled:opacity-60">
            <FieldGroup className="pb-2">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={!!errors.date}>
                  <FieldLabel htmlFor={`${id}-date`}>Data</FieldLabel>
                  <DatePicker id={`${id}-date`} value={draft.date} onChange={(date) => set("date", date)} invalid={!!errors.date} />
                  <FieldError>{errors.date?.[0]}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-network`}>Rede</FieldLabel>
                  <Select
                    items={networkItems}
                    value={draft.network ?? NO_NETWORK}
                    onValueChange={(value) => set("network", isSocialNetwork(value) ? value : null)}
                  >
                    <SelectTrigger id={`${id}-network`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[NO_NETWORK, ...SOCIAL_NETWORK_KEYS].map((value) => (
                        <SelectItem key={value} value={value}>
                          {networkItems[value as keyof typeof networkItems]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-kind`}>Tipo</FieldLabel>
                  <Select items={KIND_ITEMS} value={draft.kind} onValueChange={(value) => isPostKind(value) && set("kind", value)}>
                    <SelectTrigger id={`${id}-kind`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POST_KIND_KEYS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {POST_KINDS[kind].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <TextField
                id={`${id}-headline`}
                label="Headline"
                value={draft.headline}
                onChange={(value) => set("headline", value)}
                error={errors.headline?.[0]}
                maxLength={PLANNING_LIMITS.headline}
                className="min-h-12"
              />
              <TextField
                id={`${id}-support`}
                label="Texto de apoio"
                value={draft.supportText}
                onChange={(value) => set("supportText", value)}
                error={errors.supportText?.[0]}
                maxLength={PLANNING_LIMITS.supportText}
                className="min-h-12"
              />
              <TextField
                id={`${id}-copy`}
                label="Copy (legenda)"
                value={draft.copy}
                onChange={(value) => set("copy", value)}
                error={errors.copy?.[0]}
                maxLength={PLANNING_LIMITS.copy}
                className="max-h-96 min-h-40"
              />
              <TextField
                id={`${id}-cta`}
                label="CTA"
                value={draft.cta}
                onChange={(value) => set("cta", value)}
                error={errors.cta?.[0]}
                maxLength={PLANNING_LIMITS.cta}
                className="min-h-12"
              />
              <Field data-invalid={!!errors.hashtags}>
                <FieldLabel htmlFor={`${id}-hashtags`}>Hashtags</FieldLabel>
                <Input
                  id={`${id}-hashtags`}
                  value={draft.hashtags}
                  onChange={(event) => set("hashtags", event.target.value)}
                  placeholder="#marca #campanha"
                  aria-invalid={!!errors.hashtags}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.hashtags ? (
                  <FieldError>{errors.hashtags[0]}</FieldError>
                ) : (
                  <FieldDescription>Separadas por espaço. O # entra sozinho.</FieldDescription>
                )}
              </Field>

              {parts === "slides" && (
                <ListEditor
                  title="Slides"
                  itemLabel="Slide"
                  addLabel="Adicionar slide"
                  count={draft.slides.length}
                  max={PLANNING_LIMITS.slides}
                  error={errors.slides?.[0]}
                  onAdd={() => set("slides", [...draft.slides, { headline: "", supportText: "" }])}
                  onRemove={(index) => set("slides", draft.slides.filter((_, position) => position !== index))}
                  renderItem={(index) => {
                    const slide = draft.slides[index];
                    const update = (patch: Partial<SlideDraft>) =>
                      set("slides", draft.slides.map((item, position) => (position === index ? { ...item, ...patch } : item)));
                    return (
                      <>
                        <Textarea
                          value={slide.headline}
                          onChange={(event) => update({ headline: event.target.value })}
                          placeholder="Headline"
                          aria-label={`Headline do slide ${index + 1}`}
                          className="min-h-12"
                          maxLength={PLANNING_LIMITS.headline}
                        />
                        <Textarea
                          value={slide.supportText}
                          onChange={(event) => update({ supportText: event.target.value })}
                          placeholder="Texto de apoio"
                          aria-label={`Texto de apoio do slide ${index + 1}`}
                          className="min-h-12"
                          maxLength={PLANNING_LIMITS.supportText}
                        />
                      </>
                    );
                  }}
                />
              )}

              {parts === "scenes" && (
                <ListEditor
                  title="Cenas do roteiro"
                  itemLabel="Cena"
                  addLabel="Adicionar cena"
                  count={draft.scenes.length}
                  max={PLANNING_LIMITS.scenes}
                  error={errors.scenes?.[0]}
                  onAdd={() => set("scenes", [...draft.scenes, ""])}
                  onRemove={(index) => set("scenes", draft.scenes.filter((_, position) => position !== index))}
                  renderItem={(index) => (
                    <Textarea
                      value={draft.scenes[index]}
                      onChange={(event) =>
                        set("scenes", draft.scenes.map((scene, position) => (position === index ? event.target.value : scene)))
                      }
                      aria-label={`Texto da cena ${index + 1}`}
                      className="min-h-12"
                      maxLength={PLANNING_LIMITS.sceneText}
                    />
                  )}
                />
              )}

              <PostArtSection kind={draft.kind} drafts={art} dropped={dropped} uploadsEnabled={uploadsEnabled} locked={locked} />

              {hasNotes && (
                <Field data-invalid={!!errors.notes}>
                  <FieldLabel htmlFor={`${id}-notes`}>Observações</FieldLabel>
                  <Textarea
                    id={`${id}-notes`}
                    value={draft.notes}
                    onChange={(event) => set("notes", event.target.value)}
                    className="max-h-72 min-h-20"
                    maxLength={PLANNING_LIMITS.notes}
                  />
                  {errors.notes ? (
                    <FieldError>{errors.notes[0]}</FieldError>
                  ) : (
                    <FieldDescription>Do formato antigo (Word): o que não tem campo próprio. Apague quando não precisar mais.</FieldDescription>
                  )}
                </Field>
              )}
            </FieldGroup>
          </fieldset>
          {post && post.history.length > 0 && <PostHistory items={post.history} />}
          <DialogFooter className="sticky bottom-0 -mx-5 mt-4 border-t bg-popover px-5 pt-4">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || art.uploading || Boolean(waiting)}>
              {(isPending || art.uploading) && <Loader2Icon className="animate-spin" />}
              {art.uploading ? "Enviando as artes..." : post ? "Salvar post" : "Criar post"}
            </Button>
          </DialogFooter>
        </form>
        <ConfirmSave
          confirmation={confirmation}
          isAdmin={isAdmin}
          kindLabel={POST_KINDS[draft.kind].label}
          onCancel={() => setConfirmation(null)}
          onConfirm={(approval) => save(approval, true)}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Antes de salvar: a mudança tira a aprovação do cliente (D5), com a saída
 * "Salvar sem tirar a aprovação" para admins, ou artes saem por causa do tipo.
 */
export function ConfirmSave({
  confirmation,
  isAdmin,
  kindLabel,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation | null;
  isAdmin: boolean;
  kindLabel: string;
  onCancel: () => void;
  onConfirm: (approval?: "keep" | "drop") => void;
}) {
  // Enquanto o dialog some, continua mostrando o último pedido.
  const [shown, setShown] = useState(confirmation);
  if (confirmation && confirmation !== shown) setShown(confirmation);
  const current = confirmation ?? shown;
  const stages = current?.stages ?? [];
  const what = stages.map((stage) => STAGE_TEXT[stage]).join(" e ");

  return (
    <AlertDialog open={confirmation !== null} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-warning/14 text-warning-ink">
            <TriangleAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{stages.length ? "Isso tira a aprovação do cliente" : `As artes que não valem para ${kindLabel} saem`}</AlertDialogTitle>
          <AlertDialogDescription>
            {stages.length
              ? `O cliente já aprovou ${what} deste post. Salvando, ${stages.length > 1 ? "as aprovações saem" : "a aprovação sai"} e o post volta para ser enviado de novo.`
              : `${current?.droppedArt === 1 ? "1 arte sai" : `${current?.droppedArt ?? 0} artes saem`} do post e do servidor de arquivos.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          {stages.length > 0 && isAdmin && (
            <Hint label="Para correções pequenas (erro de digitação). Fica no histórico do post.">
              <AlertDialogAction variant="outline" onClick={() => onConfirm("keep")}>
                Salvar sem tirar a aprovação
              </AlertDialogAction>
            </Hint>
          )}
          <AlertDialogAction onClick={() => onConfirm(stages.length ? "drop" : undefined)}>
            {stages.length ? "Tirar a aprovação e salvar" : "Salvar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength: number;
  className?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
        maxLength={maxLength}
        aria-invalid={!!error}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** Lista numerada (slides do carrossel, cenas do roteiro), com adicionar e remover. */
function ListEditor({
  title,
  itemLabel,
  addLabel,
  count,
  max,
  error,
  onAdd,
  onRemove,
  renderItem,
}: {
  title: string;
  itemLabel: string;
  addLabel: string;
  count: number;
  max: number;
  error?: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (index: number) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd} disabled={count >= max}>
          <PlusIcon data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>
      {count === 0 && <p className="text-xs text-muted-foreground">Nada aqui ainda.</p>}
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {itemLabel} {index + 1}
            </span>
            <Hint label={`Remover ${itemLabel.toLowerCase()}`}>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover ${itemLabel.toLowerCase()} ${index + 1}`} onClick={() => onRemove(index)}>
                <Trash2Icon />
              </Button>
            </Hint>
          </div>
          {renderItem(index)}
        </div>
      ))}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** O histórico do post: respostas do cliente (ou registradas pela equipe) e o que mudou depois de aprovado. */
function PostHistory({ items }: { items: PostHistoryItem[] }) {
  return (
    <details className="group mt-2 rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <HistoryIcon className="size-3.5" />
        Histórico
        <span className="font-normal tabular-nums">{items.length}</span>
        <ChevronDownIcon className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ol className="flex flex-col gap-3 border-t px-3 py-3 text-sm wrap-anywhere">
        {[...items].reverse().map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5">
            <span>{item.text}</span>
            {item.comment && <span className="whitespace-pre-wrap text-muted-foreground">“{item.comment}”</span>}
            <span className="text-xs text-muted-foreground">{item.dateLabel}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
