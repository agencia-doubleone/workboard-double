import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { db } from "@/db";
import { CHAT_PAGE_SIZE } from "@/lib/chat";
import { requireSession } from "@/lib/session";
import { findConversation, listChatMessages } from "@/server/chat";
import { isMediaConfigured } from "@/server/media";
import { listMessageExtras, listPinnedMessages } from "@/server/messages";
import { ChatConversation } from "../chat-conversation";
import { ChatScreen, ChatScreenSkeleton } from "../chat-screen";
import { toChatMessageView, toConversationView, toPinnedMessageView } from "../present";

export const metadata: Metadata = { title: "Chat" };

export default function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <Suspense fallback={<ChatScreenSkeleton />}>
      <ConversationContent params={params} />
    </Suspense>
  );
}

async function ConversationContent({ params }: { params: PageProps<"/chat/[id]">["params"] }) {
  const { user } = await requireSession();
  const { id } = await params;
  // Só quem está na conversa a vê; para os outros, ela não existe.
  const conversation = z.uuid().safeParse(id).success ? await findConversation(db, id, user.id) : null;
  if (!conversation) notFound();

  const [{ messages, hasMore }, pinned] = await Promise.all([
    listChatMessages(db, conversation.id, { limit: CHAT_PAGE_SIZE }),
    listPinnedMessages(db, "chat", conversation.id),
  ]);
  const extras = await listMessageExtras(db, "chat", messages.map((message) => message.id), user.id);
  const now = new Date();

  return (
    <ChatScreen viewerId={user.id} activeId={conversation.id}>
      <ChatConversation
        // Outra conversa = outro estado (rascunho, "anteriores", linha de novas).
        key={conversation.id}
        conversation={toConversationView(conversation, messages)}
        messages={messages.map((message) => toChatMessageView(message, { viewerId: user.id, now, extras }))}
        pinned={pinned.map(toPinnedMessageView)}
        hasMore={hasMore}
        uploadsEnabled={isMediaConfigured()}
      />
    </ChatScreen>
  );
}
