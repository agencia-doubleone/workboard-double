import { desc, eq } from "drizzle-orm";

import type { Database } from "@/db";
import { guestbookEntry, user } from "@/db/schema";

// Livro de visitas da página secreta (/bastidores): quem achou a porta deixa o
// nome e, se quiser, um recado. Uma assinatura por pessoa (assinar de novo troca o recado).

export function listGuestbook(database: Database) {
  return database
    .select({
      userId: guestbookEntry.userId,
      name: user.name,
      image: user.image,
      message: guestbookEntry.message,
      signedAt: guestbookEntry.signedAt,
    })
    .from(guestbookEntry)
    .innerJoin(user, eq(user.id, guestbookEntry.userId))
    .orderBy(desc(guestbookEntry.signedAt));
}

export async function signGuestbook(database: Database, input: { userId: string; message: string | null }) {
  await database
    .insert(guestbookEntry)
    .values({ userId: input.userId, message: input.message })
    .onConflictDoUpdate({ target: guestbookEntry.userId, set: { message: input.message, signedAt: new Date() } });
}
