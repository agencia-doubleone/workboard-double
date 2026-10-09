import { getSession } from "@/lib/session";
import { signMediaSchema } from "@/lib/validations/media";
import { createUploadTicket, isMediaConfigured } from "@/server/media";

/** Autoriza o navegador a enviar um arquivo direto para o CDN (veja src/server/media). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  }
  if (!isMediaConfigured()) {
    return Response.json({ error: "O envio de arquivos ainda não está configurado." }, { status: 503 });
  }

  const parsed = signMediaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Pedido de envio inválido." },
      { status: 400 },
    );
  }

  return Response.json(createUploadTicket({ ...parsed.data, userId: session.user.id }));
}
