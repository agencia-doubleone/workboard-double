import { db } from "@/db";
import { getPortalSession } from "@/lib/portal-session";
import { completeMediaSchema } from "@/lib/validations/media";
import { getRequestMeta } from "@/server/audit";
import { completeUpload, isMediaConfigured } from "@/server/media";

/** O /api/media/complete do portal: registra o arquivo em nome do contato (ator externo). */
export async function POST(request: Request) {
  const found = await getPortalSession();
  if (!found) {
    return Response.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  }
  if (!isMediaConfigured()) {
    return Response.json({ error: "O envio de arquivos ainda não está configurado." }, { status: 503 });
  }

  const parsed = completeMediaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Recibo de envio ausente." }, { status: 400 });
  }

  const { contact } = found;
  const result = await completeUpload(db, {
    receipt: parsed.data.receipt,
    actor: { id: contact.id, name: contact.name, email: contact.email, external: true },
    meta: getRequestMeta(request.headers),
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data, { status: 201 });
}
