"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_POST_KIND,
  isPostKind,
  isSocialNetwork,
  parseHashtags,
  PLANNING_LIMITS,
  POST_KIND_KEYS,
  POST_KINDS,
  SOCIAL_NETWORK_KEYS,
  SOCIAL_NETWORKS,
  type PostKind,
  type SocialNetwork,
} from "@/lib/planning";
import { savePost } from "./actions";
import type { PostView } from "./types";

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

/** Cria (post = null) ou edita um post do mês, com os campos do JSON padrão. */
export function PostEditor({
  open,
  onOpenChange,
  planningId,
  month,
  post,
  defaultNetwork,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningId: string;
  month: string;
  post: PostView | null;
  defaultNetwork: SocialNetwork | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => toDraft(post, defaultNetwork));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();
  // Observações só existem nos posts do formato antigo: o campo aparece para editar ou apagar.
  const [hasNotes] = useState(() => Boolean(post?.notes));
  const networkItems = { [NO_NETWORK]: "Sem rede", ...SOCIAL_NETWORKS };
  const parts = POST_KINDS[draft.kind].parts;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      }).catch(() => null);
      if (!result?.ok) {
        setErrors(result && !result.ok ? (result.fieldErrors ?? {}) : {});
        toast.error(result && !result.ok ? result.error : "Não foi possível salvar o post.");
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post ? "Editar post" : "Novo post"}</DialogTitle>
          <DialogDescription>Os mesmos campos do JSON padrão. “Copiar legenda” junta a copy, o CTA e as hashtags.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="-mx-5 flex min-h-0 flex-col overflow-y-auto px-5">
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
          <DialogFooter className="sticky bottom-0 -mx-5 mt-4 border-t bg-popover px-5 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" />}
              {post ? "Salvar post" : "Criar post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
