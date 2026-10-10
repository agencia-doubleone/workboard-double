import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { CHAT_SCREEN_HEIGHT } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { listConversations } from "@/server/chat";
import { listTeamMembers } from "@/server/jobs";
import { resolveMediaUrl } from "@/server/media";
import { ChatRefresher } from "./chat-refresher";
import { ConversationList } from "./conversation-list";
import { toConversationListItem } from "./present";

/**
 * Moldura do chat: a lista de conversas à esquerda e `children` (a conversa
 * aberta ou o convite para escolher uma). No celular, uma coisa de cada vez.
 */
export async function ChatScreen({
  viewerId,
  activeId,
  children,
}: {
  viewerId: string;
  /** Conversa aberta (destacada na lista, mesmo ainda sem mensagens). */
  activeId?: string;
  children: React.ReactNode;
}) {
  const [conversations, team] = await Promise.all([
    listConversations(db, viewerId, activeId),
    listTeamMembers(db),
  ]);
  const now = new Date();
  const talkingTo = new Set(conversations.flatMap((item) => (item.other ? [item.other.id] : [])));
  // Quem ainda não tem conversa aparece embaixo, para começar uma.
  const people = team
    .filter((person) => person.id !== viewerId && !talkingTo.has(person.id))
    .map((person) => ({ id: person.id, name: person.name, imageUrl: resolveMediaUrl(person.image), active: true }));

  return (
    <div className={cn("flex overflow-hidden rounded-xl border bg-card shadow-raised", CHAT_SCREEN_HEIGHT)}>
      <ChatRefresher />
      <ConversationList
        conversations={conversations.map((item) => toConversationListItem(item, { viewerId, now }))}
        people={people}
        activeId={activeId}
        className={activeId ? "hidden md:flex" : "flex"}
      />
      <section className={cn("min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>{children}</section>
    </div>
  );
}

export function ChatScreenSkeleton() {
  return (
    <div
      aria-busy="true"
      className={cn("flex overflow-hidden rounded-xl border bg-card shadow-raised", CHAT_SCREEN_HEIGHT)}
    >
      <div className="flex w-full flex-col gap-3 border-r p-3 md:w-80">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-1 py-1.5">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-1 md:block" />
    </div>
  );
}
