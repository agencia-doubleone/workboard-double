import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db";
import { media } from "@/db/schema";
import { env } from "@/env";
import {
  getMediaType,
  MEDIA_FOLDERS,
  MEDIA_NAME_MAX_LENGTH,
  type MediaFolder,
  type MediaItem,
  type MediaUploadTicket,
} from "@/lib/media";
import { createAuditRecorder, type AuditActor, type getRequestMeta } from "@/server/audit/recorder";
import { buildMediaKey, MEDIA_KEY_PATTERN } from "./keys";
import { signMediaToken, verifyMediaToken } from "./token";

// Fluxo de upload (o arquivo nunca passa pela Vercel, que limita o corpo a 4.5 MB):
// 1. /api/media/sign: createUploadTicket assina um token com caminho, tamanho e tipo;
// 2. o navegador envia token + arquivo direto para {MEDIA_CDN_URL}/upload.php;
// 3. o PHP grava em uploads/{key} e devolve um recibo assinado;
// 4. /api/media/complete: completeUpload confere o recibo, grava em `media` e audita.
// Excluir é servidor para servidor: deleteMedia chama {MEDIA_CDN_URL}/delete.php.

/** O PHP só confere o token depois de receber o arquivo inteiro: cobre envios longos. */
const UPLOAD_TICKET_TTL_SECONDS = 60 * 60;
const RECEIPT_TTL_SECONDS = 60 * 60;
const DELETE_TOKEN_TTL_SECONDS = 60;
const CDN_TIMEOUT_MS = 15_000;

type RequestMeta = ReturnType<typeof getRequestMeta>;
type MediaRow = typeof media.$inferSelect;
export type MediaResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function fail(status: number, error: string): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

export function isMediaConfigured() {
  return Boolean(env.MEDIA_CDN_URL && env.MEDIA_SIGNING_SECRET);
}

function getConfig() {
  if (!env.MEDIA_CDN_URL || !env.MEDIA_SIGNING_SECRET) {
    throw new Error("Storage de arquivos não configurado (MEDIA_CDN_URL e MEDIA_SIGNING_SECRET).");
  }
  return { baseUrl: env.MEDIA_CDN_URL, secret: env.MEDIA_SIGNING_SECRET };
}

export function getMediaUrl(key: string) {
  return `${env.MEDIA_CDN_URL ?? ""}/uploads/${key}`;
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toMediaItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    key: row.key,
    url: getMediaUrl(row.key),
    name: row.name,
    type: row.type,
    size: row.size,
    folder: row.folder as MediaFolder,
    createdAt: row.createdAt.toISOString(),
  };
}

function mediaEntity(row: MediaRow) {
  return { type: "media" as const, id: row.id, label: row.name };
}

function mediaAuditMetadata(row: MediaRow) {
  return { key: row.key, size: row.size, type: row.type, folder: row.folder };
}

export async function findMediaById(database: Database, id: string) {
  const [found] = await database.select().from(media).where(eq(media.id, id)).limit(1);
  return found ?? null;
}

async function findMediaByKey(database: Database, key: string) {
  const [found] = await database.select().from(media).where(eq(media.key, key)).limit(1);
  return found ?? null;
}

/** Autoriza um envio. Espera a entrada já validada por signMediaSchema. */
export function createUploadTicket(input: {
  name: string;
  size: number;
  folder: MediaFolder;
  userId: string;
}): MediaUploadTicket {
  const { baseUrl, secret } = getConfig();
  const type = getMediaType(input.name);
  if (!type) throw new Error(`Tipo de arquivo não permitido: ${input.name}`);

  const key = buildMediaKey({ folder: input.folder, fileName: input.name, extension: type.extension });
  const exp = nowInSeconds() + UPLOAD_TICKET_TTL_SECONDS;
  const token = signMediaToken(
    "upload",
    { key, name: input.name, size: input.size, type: type.mime, uid: input.userId, exp },
    secret,
  );

  return { uploadUrl: `${baseUrl}/upload.php`, token, key, expiresAt: new Date(exp * 1000).toISOString() };
}

const receiptSchema = z.object({
  key: z.string().regex(MEDIA_KEY_PATTERN),
  name: z.string().min(1).max(MEDIA_NAME_MAX_LENGTH),
  size: z.number().int().positive(),
  type: z.string().min(1),
  uid: z.string().min(1),
  iat: z.number().int(),
});

/** Registra o arquivo a partir do recibo do PHP. Repetir o mesmo recibo devolve o mesmo registro. */
export async function completeUpload(
  database: Database,
  { receipt, actor, meta }: { receipt: string; actor: AuditActor; meta: RequestMeta },
): Promise<MediaResult<MediaItem>> {
  const { secret } = getConfig();
  const parsed = receiptSchema.safeParse(verifyMediaToken("receipt", receipt, secret));
  if (!parsed.success) return fail(400, "Recibo de envio inválido.");

  const { key, name, size, type, uid, iat } = parsed.data;
  if (uid !== actor.id) return fail(403, "Este envio foi autorizado para outra pessoa.");
  if (nowInSeconds() - iat > RECEIPT_TTL_SECONDS) {
    return fail(400, "O recibo de envio expirou. Envie o arquivo de novo.");
  }
  const folder = key.split("/")[0];
  if (!MEDIA_FOLDERS.includes(folder as MediaFolder)) return fail(400, "Pasta inválida.");

  const [inserted] = await database
    .insert(media)
    .values({ key, folder, name, type, size, uploadedById: actor.id })
    .onConflictDoNothing({ target: media.key })
    .returning();

  if (!inserted) {
    // Recibo repetido (ex.: o navegador tentou de novo): sem nova auditoria.
    const existing = await findMediaByKey(database, key);
    if (!existing || existing.uploadedById !== actor.id) return fail(409, "Este arquivo já foi registrado.");
    return { ok: true, data: toMediaItem(existing) };
  }

  await createAuditRecorder(database)({
    action: "media.uploaded",
    actor,
    entity: mediaEntity(inserted),
    metadata: mediaAuditMetadata(inserted),
    ...meta,
  });
  return { ok: true, data: toMediaItem(inserted) };
}

/** Apaga do CDN e do banco. Só quem enviou ou um admin. */
export async function deleteMedia(
  database: Database,
  { id, actor, meta }: { id: string; actor: AuditActor & { role?: string | null }; meta: RequestMeta },
): Promise<MediaResult<{ name: string }>> {
  const row = await findMediaById(database, id);
  if (!row) return fail(404, "Arquivo não encontrado.");
  if (row.uploadedById !== actor.id && actor.role !== "admin") {
    return fail(403, "Você não tem permissão para excluir este arquivo.");
  }

  const removed = await deleteFromCdn(row.key);
  if (!removed.ok) return removed;

  await database.delete(media).where(eq(media.id, row.id));
  await createAuditRecorder(database)({
    action: "media.deleted",
    actor,
    entity: mediaEntity(row),
    // removedFromCdn = false: o arquivo já não existia lá (registro órfão).
    metadata: { ...mediaAuditMetadata(row), removedFromCdn: removed.data.deleted },
    ...meta,
  });
  return { ok: true, data: { name: row.name } };
}

async function deleteFromCdn(key: string): Promise<MediaResult<{ deleted: boolean }>> {
  const { baseUrl, secret } = getConfig();
  const token = signMediaToken("delete", { key, exp: nowInSeconds() + DELETE_TOKEN_TTL_SECONDS }, secret);

  try {
    const response = await fetch(`${baseUrl}/delete.php`, {
      method: "POST",
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(CDN_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    const result = body as { ok?: unknown; deleted?: unknown } | null;
    if (!response.ok || result?.ok !== true) {
      console.error("[media] o CDN recusou a exclusão", response.status, body);
      return fail(502, "Não foi possível excluir o arquivo no servidor de arquivos.");
    }
    return { ok: true, data: { deleted: result.deleted === true } };
  } catch (error) {
    console.error("[media] falha ao falar com o CDN", error);
    return fail(502, "O servidor de arquivos não respondeu. Tente de novo.");
  }
}
