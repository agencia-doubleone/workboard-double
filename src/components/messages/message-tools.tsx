"use client";

import {
  ChevronDownIcon,
  CopyIcon,
  EllipsisIcon,
  PaperclipIcon,
  PinIcon,
  PinOffIcon,
  SmilePlusIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { Linkified } from "@/components/messages/linkified";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  joinNames,
  messageElementId,
  MESSAGE_EFFECTS,
  MESSAGE_REACTIONS,
  type MessageEffect,
  type PinnedMessageView,
  type ReactionView,
} from "@/lib/messages";
import { cn } from "@/lib/utils";

// Peças das mensagens compartilhadas entre o chat e os trabalhos: reações,
// o menu de cada mensagem (fixar, favoritar, copiar, excluir), o painel das
// fixadas e a linha dos comandos com efeito.


function reactionLabel(reaction: ReactionView) {
  const names = joinNames(reaction.names);
  const who = names.charAt(0).toUpperCase() + names.slice(1);
  return `${who} ${reaction.count > 1 ? "reagiram" : "reagiu"} com ${reaction.emoji}`;
}

/** As reações da mensagem: clicar liga ou desliga a sua. */
export function ReactionList({
  reactions,
  onToggle,
  disabled,
  className,
}: {
  reactions: ReactionView[];
  onToggle: (emoji: string) => void;
  /** Conversa só para leitura: mostra, mas não deixa reagir. */
  disabled?: boolean;
  className?: string;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {reactions.map((reaction) => (
        <Hint key={reaction.emoji} label={reactionLabel(reaction)}>
          <button
            type="button"
            aria-pressed={reaction.mine}
            aria-label={reactionLabel(reaction)}
            disabled={disabled}
            onClick={() => onToggle(reaction.emoji)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default",
              reaction.mine
                ? "border-primary/40 bg-primary-soft text-primary-ink"
                : "bg-background text-muted-foreground enabled:hover:bg-muted",
            )}
          >
            <span className="text-sm leading-none">{reaction.emoji}</span>
            {reaction.count}
          </button>
        </Hint>
      ))}
    </div>
  );
}

/**
 * Ações de uma mensagem, que aparecem ao passar o mouse (sempre visíveis no
 * celular): reagir e o menu com fixar, favoritar, copiar o texto e excluir.
 */
export function MessageToolbar({
  pinned,
  favorite,
  text,
  canReact,
  onReact,
  onTogglePin,
  onToggleFavorite,
  onDelete,
  align = "end",
  className,
}: {
  pinned: boolean;
  favorite: boolean;
  /** Texto para "Copiar texto" (vazio = sem a opção). */
  text: string;
  /** Reagir e fixar (não numa conversa só para leitura). */
  canReact: boolean;
  onReact: (emoji: string) => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  /** Ausente = quem vê não pode excluir. */
  onDelete?: () => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100",
        className,
      )}
    >
      {canReact && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <Hint label="Reagir">
            <PopoverTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="Reagir" className="text-muted-foreground" />}
            >
              <SmilePlusIcon />
            </PopoverTrigger>
          </Hint>
          <PopoverContent align={align} side="top" className="flex w-auto flex-row gap-0.5 p-1">
            {MESSAGE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Reagir com ${emoji}`}
                onClick={() => {
                  setPickerOpen(false);
                  onReact(emoji);
                }}
                className="flex size-9 items-center justify-center rounded-md text-xl outline-none transition-transform hover:scale-110 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      <DropdownMenu>
        <Hint label="Mais ações">
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label="Mais ações da mensagem" className="text-muted-foreground" />}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align={align} className="w-52">
          {canReact && (
            <DropdownMenuItem onClick={onTogglePin}>
              {pinned ? <PinOffIcon /> : <PinIcon />}
              {pinned ? "Desafixar" : "Fixar na conversa"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onToggleFavorite}>
            {favorite ? <StarOffIcon /> : <StarIcon />}
            {favorite ? "Tirar das favoritas" : "Favoritar"}
          </DropdownMenuItem>
          {text && (
            <DropdownMenuItem onClick={copyText}>
              <CopyIcon />
              Copiar texto
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Rola até a mensagem e pisca o fundo dela; false se ela não está carregada. */
export function jumpToMessage(id: string) {
  const element = document.getElementById(messageElementId(id));
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.animate(
    [{ backgroundColor: "color-mix(in oklab, var(--primary) 20%, transparent)" }, { backgroundColor: "transparent" }],
    { duration: 1_800, easing: "ease-out" },
  );
  return true;
}

/** Ao abrir a conversa por um link "#mensagem-…" (das favoritas): vai até ela. False se não há ou não está carregada. */
export function jumpToHashMessage() {
  const prefix = `#${messageElementId("")}`;
  const { hash } = window.location;
  return hash.startsWith(prefix) && jumpToMessage(decodeURIComponent(hash.slice(prefix.length)));
}

/** As fixadas, no topo da conversa: aberto mostra o texto de cada uma, com "ir até" e desafixar. */
export function PinnedMessages({
  items,
  onUnpin,
  className,
}: {
  items: PinnedMessageView[];
  /** Ausente = só leitura. */
  onUnpin?: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  const latest = items[0];
  return (
    <details className={cn("group/pinned shrink-0 border-b bg-muted/30", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <PinIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary-ink" />
        <span className="shrink-0 font-medium">
          {items.length === 1 ? "1 mensagem fixada" : `${items.length} mensagens fixadas`}
        </span>
        {/* w-0 + flex-1: a prévia não alarga a página (o caminho do drive pode ser enorme). */}
        <span className="w-0 min-w-0 flex-1 truncate text-muted-foreground group-open/pinned:hidden">
          {latest.authorName}: {latest.text || "anexo"}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open/pinned:rotate-180"
        />
      </summary>
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2">
            <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="truncate font-medium text-foreground">{item.authorName}</span>
              <span className="shrink-0 tabular-nums">{item.time}</span>
              {item.pinnedBy && <span className="truncate">· fixada por {item.pinnedBy}</span>}
            </div>
            {item.text && (
              <p className="line-clamp-4 text-sm leading-relaxed break-words whitespace-pre-wrap">
                <Linkified text={item.text} />
              </p>
            )}
            {item.attachments > 0 && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <PaperclipIcon aria-hidden="true" className="size-3" />
                {item.attachments === 1 ? "1 anexo" : `${item.attachments} anexos`}
              </p>
            )}
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  if (!jumpToMessage(item.id)) {
                    toast.info("Essa mensagem é mais antiga que as carregadas. Carregue as anteriores para vê-la no lugar.");
                  }
                }}
              >
                Ir para a mensagem
              </Button>
              {onUnpin && (
                <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onUnpin(item.id)}>
                  <PinOffIcon data-icon="inline-start" />
                  Desafixar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Mensagem de comando ("/coffee"): uma linha no meio da conversa; clicar mostra o efeito de novo. */
export function EffectLine({
  id,
  effect,
  who,
  time,
  onReplay,
  onDelete,
}: {
  id: string;
  effect: MessageEffect;
  /** "Você" ou o nome de quem mandou. */
  who: string;
  time: string;
  onReplay: () => void;
  onDelete?: () => void;
}) {
  const { emoji, label } = MESSAGE_EFFECTS[effect];
  return (
    <div id={messageElementId(id)} className="group/message my-2 flex items-center justify-center gap-1 rounded-lg">
      <Hint label="Ver de novo">
        <button
          type="button"
          onClick={onReplay}
          className="flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className="text-base leading-none">
            {emoji}
          </span>
          <span className="truncate">
            <span className="font-medium text-foreground">{who}</span> {label}
          </span>
          <span className="shrink-0 tabular-nums">· {time}</span>
        </button>
      </Hint>
      {onDelete && (
        <Hint label="Excluir">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Excluir"
            onClick={onDelete}
            className="text-muted-foreground opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <Trash2Icon />
          </Button>
        </Hint>
      )}
    </div>
  );
}
