import { db } from "@/db";
import type { UnlockedAchievement } from "@/lib/achievements";
import { getSession } from "@/lib/session";
import { achievementRequestSchema } from "@/lib/validations/achievements";
import { checkInAchievements, handleAchievementEvent } from "@/server/achievements/client-events";
import { claimUnseenAchievements } from "@/server/achievements/page";

// Conquistas do lado do navegador: eventos (tema, atalhos, segredos...), a
// checagem do dia e os avisos ainda não vistos. Rota (e não Server Action) para
// não entrar na fila das actions e da navegação: são avisos de fundo, muitas
// vezes disparados junto com uma troca de página.

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await getSession();
  if (!session) return Response.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  const parsed = achievementRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const { user } = session;
  const viewer = {
    id: user.id,
    name: user.name,
    isAdmin: user.role === "admin",
    createdAt: new Date(user.createdAt),
    birthday: user.birthday ?? null,
  };
  let unlocked: UnlockedAchievement[];
  if (parsed.data.action === "claim") {
    unlocked = await claimUnseenAchievements(db, user.id);
  } else {
    const now = new Date();
    const ids =
      parsed.data.action === "check-in"
        ? await checkInAchievements(db, viewer, now)
        : await handleAchievementEvent(db, viewer, parsed.data.event, now);
    unlocked = ids.map((id) => ({ id, unlockedAt: now.toISOString() }));
  }
  return Response.json({ unlocked }, { headers: { "Cache-Control": "no-store" } });
}
