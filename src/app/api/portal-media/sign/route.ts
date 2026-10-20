import { getMediaType } from "@/lib/media";
import { getPortalSession } from "@/lib/portal-session";
import { signMediaSchema } from "@/lib/validations/media";
import { createUploadTicket, isMediaConfigured } from "@/server/media";

/**
 * O /api/media/sign do portal do cliente: autoriza o contato a enviar direto
 * ao CDN, só em duas pastas: "portal" (a foto do perfil, só imagens) e
 * "solicitacoes" (briefing e anexos das mensagens das solicitações).
 */
export async function POST(request: Request) {
  const found = await getPortalSession();
  if (!found) {
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
  const { folder, name } = parsed.data;
  if (folder !== "portal" && folder !== "solicitacoes") {
    return Response.json({ error: "Pasta inválida." }, { status: 400 });
  }
  if (folder === "portal" && getMediaType(name)?.kind !== "image") {
    return Response.json({ error: "Envie uma imagem (JPG, PNG ou WebP)." }, { status: 400 });
  }

  return Response.json(createUploadTicket({ ...parsed.data, uploader: { id: found.contact.id, external: true } }));
}
