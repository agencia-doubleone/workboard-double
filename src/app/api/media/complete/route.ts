import { db } from "@/db";
import { getSession } from "@/lib/session";
import { completeMediaSchema } from "@/lib/validations/media";
import { getRequestMeta } from "@/server/audit";
import { completeUpload, isMediaConfigured } from "@/server/media";

/** Registra o arquivo depois que o CDN confirmou o envio (recibo assinado pelo PHP). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  }
  if (!isMediaConfigured()) {
    return Response.json({ error: "O envio de arquivos ainda não está configurado." }, { status: 503 });
  }

  const parsed = completeMediaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Recibo de envio ausente." }, { status: 400 });
  }

  const result = await completeUpload(db, {
    receipt: parsed.data.receipt,
    actor: session.user,
    meta: getRequestMeta(request.headers),
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data, { status: 201 });
}
