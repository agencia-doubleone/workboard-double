import { z } from "zod";

import { db } from "@/db";
import { getSession } from "@/lib/session";
import { findAccessibleWhiteboard } from "@/server/whiteboards";

/**
 * Miniatura de um quadro (guardada no banco como data URL). Só para quem acessa
 * o quadro. O endereço muda a cada miniatura nova (?v=), então pode ficar em cache.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/quadros/[id]/miniatura">) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  const found = await findAccessibleWhiteboard(db, id, { id: session.user.id, isAdmin: session.user.role === "admin" });
  const match = found?.board.preview ? /^data:(image\/(?:webp|png));base64,(.+)$/.exec(found.board.preview) : null;
  if (!match) return new Response(null, { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
