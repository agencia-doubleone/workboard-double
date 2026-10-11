"use client";

import { Loader2Icon, SearchIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useIsTyping } from "@/components/realtime/realtime-store";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { startConversation } from "./actions";
import type { ChatPersonView, ConversationListItemView } from "./types";

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

type ConversationListProps = {
  conversations: ConversationListItemView[];
  /** Equipe ativa sem conversa ainda (para começar uma). */
  people: ChatPersonView[];
  activeId?: string;
  /** A tela das favoritas está aberta. */
  favoritesActive?: boolean;
  className?: string;
};

export function ConversationList({ conversations, people, activeId, favoritesActive, className }: ConversationListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const query = normalize(search.trim());
  const matches = (name: string) => !query || normalize(name).includes(query);
  const shownConversations = conversations.filter((item) => matches(item.title));
  const shownPeople = people.filter((person) => matches(person.name));

  function start(person: ChatPersonView) {
    setStartingId(person.id);
    startTransition(async () => {
      const result = await startConversation({ userId: person.id });
      if (!result.ok || !result.conversationId) {
        toast.error(result.ok ? "Não foi possível abrir a conversa." : result.error);
        setStartingId(null);
        return;
      }
      setSearch("");
      router.push(`/chat/${result.conversationId}`);
      setStartingId(null);
    });
  }

  return (
    <aside aria-label="Conversas" className={cn("w-full shrink-0 flex-col border-r md:w-80", className)}>
      <div className="border-b p-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pessoa"
            aria-label="Buscar pessoa"
          />
        </InputGroup>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
        {!query && (
          <Link
            href="/chat/favoritas"
            aria-current={favoritesActive ? "page" : undefined}
            className="-mb-2 flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-muted"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink">
              <StarIcon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">Favoritas</span>
              <span className="truncate text-xs text-muted-foreground">Mensagens que você guardou</span>
            </span>
          </Link>
        )}
        {shownConversations.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {shownConversations.map((item) => (
              <li key={item.id}>
                <ConversationLink item={item} active={item.id === activeId} />
              </li>
            ))}
          </ul>
        )}
        {shownPeople.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">
              {conversations.length > 0 ? "Começar conversa" : "Com quem você quer conversar?"}
            </p>
            <ul className="flex flex-col gap-0.5">
              {shownPeople.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => start(person)}
                    disabled={startingId !== null}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                  >
                    <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-8" />
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    {startingId === person.id && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {shownConversations.length === 0 && shownPeople.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {query ? "Ninguém com esse nome." : "Ainda não há mais ninguém na equipe."}
          </p>
        )}
      </div>
    </aside>
  );
}

function ConversationLink({ item, active }: { item: ConversationListItemView; active: boolean }) {
  const typing = useIsTyping(item.other?.id);
  const unread = item.unread > 0;
  return (
    <Link
      href={`/chat/${item.id}`}
      aria-current={active ? "page" : undefined}
      className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-muted"
    >
      <UserAvatar name={item.title} imageUrl={item.other?.imageUrl} className="size-10" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{item.title}</span>
          {item.lastMessage && (
            <span className={cn("shrink-0 text-xs tabular-nums", unread ? "font-medium text-primary-ink" : "text-muted-foreground")}>
              {item.lastMessage.time}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-xs", unread && !typing ? "text-foreground" : "text-muted-foreground")}>
            {typing ? (
              <span className="text-primary-ink">digitando…</span>
            ) : item.lastMessage ? (
              `${item.lastMessage.mine ? "Você: " : ""}${item.lastMessage.preview}`
            ) : (
              "Nenhuma mensagem ainda"
            )}
          </span>
          {unread && (
            <span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {item.unread > 99 ? "99+" : item.unread}
              <span className="sr-only"> não lidas</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
