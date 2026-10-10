"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FORMAT_SUGGESTIONS, PLANNING_LIMITS, SOCIAL_NETWORKS, SOCIAL_NETWORK_KEYS, isSocialNetwork, type PostSection, type SocialNetwork } from "@/lib/planning";
import { savePost } from "./actions";
import type { PostView } from "./types";

type Draft = {
  date: string;
  network: SocialNetwork | null;
  format: string;
  topic: string;
  headline: string;
  copy: string;
  sections: PostSection[];
};

const NO_NETWORK = "nenhuma";

function toDraft(post: PostView | null, defaultNetwork: SocialNetwork | null): Draft {
  return {
    date: post?.date ?? "",
    network: post ? post.network : defaultNetwork,
    format: post?.format ?? "",
    topic: post?.topic ?? "",
    headline: post?.headline ?? "",
    copy: post?.copy ?? "",
    sections: post?.sections ?? [],
  };
}

/** Cria (post = null) ou edita um post do mês. */
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
  const networkItems = { [NO_NETWORK]: "Sem rede", ...SOCIAL_NETWORKS };

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setSection(index: number, patch: Partial<PostSection>) {
    set(
      "sections",
      draft.sections.map((section, position) => (position === index ? { ...section, ...patch } : section)),
    );
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
        format: draft.format,
        topic: draft.topic,
        headline: draft.headline,
        copy: draft.copy,
        sections: draft.sections,
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
          <DialogDescription>Headline e copy vão para a aprovação; as seções guardam o resto (tema, roteiro, briefing da arte...).</DialogDescription>
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
              <Field data-invalid={!!errors.format}>
                <FieldLabel htmlFor={`${id}-format`}>Formato</FieldLabel>
                <Input
                  id={`${id}-format`}
                  list={`${id}-formats`}
                  value={draft.format}
                  onChange={(event) => set("format", event.target.value)}
                  placeholder="Ex.: Carrossel — 3 cards"
                  maxLength={PLANNING_LIMITS.format}
                />
                <datalist id={`${id}-formats`}>
                  {FORMAT_SUGGESTIONS.map((format) => (
                    <option key={format} value={format} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${id}-topic`}>Tema</FieldLabel>
              <Input
                id={`${id}-topic`}
                value={draft.topic}
                onChange={(event) => set("topic", event.target.value)}
                placeholder="Ex.: Direito Empresarial"
                maxLength={PLANNING_LIMITS.topic}
              />
            </Field>
            <Field data-invalid={!!errors.headline}>
              <FieldLabel htmlFor={`${id}-headline`}>Headline</FieldLabel>
              <Textarea
                id={`${id}-headline`}
                value={draft.headline}
                onChange={(event) => set("headline", event.target.value)}
                className="min-h-12"
                maxLength={PLANNING_LIMITS.headline}
                aria-invalid={!!errors.headline}
              />
              <FieldError>{errors.headline?.[0]}</FieldError>
            </Field>
            <Field data-invalid={!!errors.copy}>
              <FieldLabel htmlFor={`${id}-copy`}>Copy (legenda)</FieldLabel>
              <Textarea
                id={`${id}-copy`}
                value={draft.copy}
                onChange={(event) => set("copy", event.target.value)}
                className="max-h-96 min-h-40"
                maxLength={PLANNING_LIMITS.copy}
                aria-invalid={!!errors.copy}
              />
              <FieldError>{errors.copy?.[0]}</FieldError>
            </Field>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Seções</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set("sections", [...draft.sections, { label: "", text: "" }])}
                  disabled={draft.sections.length >= PLANNING_LIMITS.sections}
                >
                  <PlusIcon data-icon="inline-start" />
                  Adicionar seção
                </Button>
              </div>
              {draft.sections.length === 0 && (
                <p className="text-xs text-muted-foreground">Ex.: Tema central, Texto de apoio, Abordagem, Roteiro do Reel, briefing da arte.</p>
              )}
              {draft.sections.map((section, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={section.label}
                      onChange={(event) => setSection(index, { label: event.target.value })}
                      placeholder="Nome da seção"
                      aria-label="Nome da seção"
                      className="h-9"
                      maxLength={PLANNING_LIMITS.sectionLabel}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover seção"
                      onClick={() => set("sections", draft.sections.filter((_, position) => position !== index))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <Textarea
                    value={section.text}
                    onChange={(event) => setSection(index, { text: event.target.value })}
                    aria-label={section.label || "Texto da seção"}
                    className="max-h-72"
                    maxLength={PLANNING_LIMITS.sectionText}
                  />
                </div>
              ))}
              <FieldError>{errors.sections?.[0]}</FieldError>
            </div>
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
