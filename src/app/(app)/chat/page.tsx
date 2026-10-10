import { MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireSession } from "@/lib/session";
import { ChatScreen, ChatScreenSkeleton } from "./chat-screen";

export const metadata: Metadata = { title: "Chat" };

// Chat interno 1:1. A lista fica à esquerda; a conversa abre em /chat/[id].
export default function ChatPage() {
  return (
    <Suspense fallback={<ChatScreenSkeleton />}>
      <ChatHome />
    </Suspense>
  );
}

async function ChatHome() {
  const { user } = await requireSession();
  return (
    <ChatScreen viewerId={user.id}>
      <div className="m-auto flex max-w-xs flex-col items-center gap-2 p-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
          <MessagesSquareIcon className="size-5" />
        </span>
        <p className="text-sm font-medium">Escolha uma conversa</p>
        <p className="text-sm text-muted-foreground">
          Ou procure alguém da equipe na lista para começar. As conversas são só entre vocês dois.
        </p>
      </div>
    </ChatScreen>
  );
}
