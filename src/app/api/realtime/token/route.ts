import { getSession } from "@/lib/session";
import { createRealtimeTicket } from "@/server/realtime";

/** Abre o tempo real: devolve o endereço do websocket e um token de 1 minuto para essa pessoa. */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  }
  const ticket = await createRealtimeTicket(session.user.id);
  if (!ticket) {
    return Response.json({ error: "O tempo real não está configurado." }, { status: 503 });
  }
  return Response.json({ ...ticket, userId: session.user.id }, { headers: { "Cache-Control": "no-store" } });
}
