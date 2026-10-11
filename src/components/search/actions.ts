"use server";

import { z } from "zod";

import { db } from "@/db";
import { isSearchable, SEARCH_MAX_LENGTH, type SearchGroup } from "@/lib/search";
import { getSession } from "@/lib/session";
import { resolveMediaUrl } from "@/server/media";
import { globalSearch } from "@/server/search";

const searchSchema = z.object({ query: z.string().max(SEARCH_MAX_LENGTH) });

/** Busca global (Ctrl+K). null = sessão expirada; [] = nada (ou busca curta demais). */
export async function searchEverything(input: { query: string }): Promise<SearchGroup[] | null> {
  const session = await getSession();
  if (!session) return null;
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success || !isSearchable(parsed.data.query)) return [];
  return globalSearch(
    db,
    { id: session.user.id, isAdmin: session.user.role === "admin" },
    parsed.data.query,
    { mediaUrl: resolveMediaUrl },
  );
}
