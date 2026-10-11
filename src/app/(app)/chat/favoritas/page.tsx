import type { Metadata } from "next";
import { Suspense } from "react";

import { db } from "@/db";
import { extractMentions } from "@/lib/jobs";
import { requireSession } from "@/lib/session";
import { findUserNames } from "@/server/jobs";
import { listFavoriteMessages } from "@/server/messages";
import { ChatScreen, ChatScreenSkeleton } from "../chat-screen";
import { FavoritesPane } from "../favorites-pane";
import { toFavoriteMessageView } from "../present";

export const metadata: Metadata = { title: "Favoritas" };

// As mensagens que a pessoa guardou (do chat e dos trabalhos), no lugar da
// conversa. Só aparecem as que ela ainda pode ler.
export default function FavoritesPage() {
  return (
    <Suspense fallback={<ChatScreenSkeleton />}>
      <FavoritesContent />
    </Suspense>
  );
}

async function FavoritesContent() {
  const { user } = await requireSession();
  const items = await listFavoriteMessages(db, { id: user.id, isAdmin: user.role === "admin" });
  // Nomes de quem foi mencionado nas mensagens dos trabalhos.
  const names = await findUserNames(db, items.flatMap((item) => (item.kind === "job" ? extractMentions(item.body) : [])));

  return (
    <ChatScreen viewerId={user.id} view="favorites">
      <FavoritesPane items={items.map((item) => toFavoriteMessageView(item, names))} />
    </ChatScreen>
  );
}
