"use client";

import { ArrowLeftIcon, BriefcaseIcon, MessagesSquareIcon, StarIcon, StarOffIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { Linkified } from "@/components/messages/linkified";
import { MessageAttachments } from "@/components/messages/message-attachments";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { MESSAGE_EFFECTS } from "@/lib/messages";
import { toggleJobMessageFavorite } from "../trabalhos/actions";
import { toggleChatFavorite } from "./actions";
import type { FavoriteMessageView } from "./types";

/** As mensagens que a pessoa guardou, do chat e dos trabalhos (só ela vê). */
export function FavoritesPane({ items }: { items: FavoriteMessageView[] }) {
  const [isPending, startTransition] = useTransition();

  function remove(item: FavoriteMessageView) {
    startTransition(async () => {
      const result = await (item.kind === "job"
        ? toggleJobMessageFavorite({ messageId: item.id })
        : toggleChatFavorite({ messageId: item.id })
      ).catch(() => null);
      if (!result?.ok) toast.error(result && !result.ok ? result.error : "Não foi possível salvar.");
      else toast.success("Tirada das favoritas.");
    });
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
        <Link
          href="/chat"
          aria-label="Voltar para as conversas"
          className="-ml-1 flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink">
          <StarIcon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-sm font-semibold">Mensagens favoritas</h1>
          <p className="truncate text-xs text-muted-foreground">Do chat e dos trabalhos. Só você vê.</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
        {items.length === 0 ? (
          <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
              <StarIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">Nenhuma favorita ainda</p>
            <p className="text-sm text-muted-foreground">
              Passe o mouse numa mensagem (do chat ou de um trabalho), abra o menu “…” e escolha “Favoritar” para guardar
              aqui.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const SourceIcon = item.kind === "job" ? BriefcaseIcon : MessagesSquareIcon;
              return (
                <li key={item.id} className="flex flex-col gap-2 rounded-xl border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <SourceIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    <Link
                      href={item.source.href}
                      className="min-w-0 truncate font-medium text-foreground outline-none hover:underline focus-visible:underline"
                    >
                      {item.source.label}
                    </Link>
                    <Hint label="Tirar das favoritas">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Tirar das favoritas"
                        className="ml-auto text-muted-foreground"
                        disabled={isPending}
                        onClick={() => remove(item)}
                      >
                        <StarOffIcon />
                      </Button>
                    </Hint>
                  </div>
                  <div className="flex gap-2.5">
                    <UserAvatar name={item.authorName} imageUrl={item.authorImageUrl} className="size-8" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium">{item.authorName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.time}</span>
                      </div>
                      {item.effect ? (
                        <p className="text-sm text-muted-foreground">
                          {MESSAGE_EFFECTS[item.effect].emoji} {MESSAGE_EFFECTS[item.effect].label}
                        </p>
                      ) : (
                        item.text && (
                          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                            <Linkified text={item.text} />
                          </p>
                        )
                      )}
                      {item.attachments.length > 0 && <MessageAttachments attachments={item.attachments} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
