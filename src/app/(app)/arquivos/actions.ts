"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { getAdminSession } from "@/lib/session";
import { getRequestMeta } from "@/server/audit";
import { deleteMedia, deleteUnregisteredMedia, isMediaConfigured, listCdnFiles } from "@/server/media";
import { MEDIA_KEY_PATTERN } from "@/server/media/keys";
import { compareWithCdn, listMediaLibrary, mediaUsage, unregisteredUsage } from "@/server/media/library";

// Limpeza do CDN (só admins): exclui arquivos que nada no sistema usa e os que
// estão no servidor sem registro. O uso é conferido de novo na hora de excluir
// (alguém pode ter acabado de enviar a mensagem com o anexo). Cada exclusão vai
// para a auditoria (media.deleted).

export type FilesActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Excluídos por chamada na limpeza geral (cada um é uma ida ao CDN); a tela chama de novo até acabar. */
const CLEANUP_BATCH = 25;

const FORBIDDEN = { ok: false, error: "Você não tem permissão para esta ação." } as const;
const NOT_CONFIGURED = { ok: false, error: "O servidor de arquivos não está configurado." } as const;

async function getAdminContext() {
  const session = await getAdminSession();
  if (!session) return null;
  return { actor: session.user, meta: getRequestMeta(await headers()) };
}

/** Exclui um arquivo sem uso (inclusive um recente: quem exclui já foi avisado do rascunho). */
export async function deleteUnusedFile(input: { mediaId: string }): Promise<FilesActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isMediaConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ mediaId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido." };

  const file = (await listMediaLibrary(db)).find((item) => item.id === parsed.data.mediaId);
  if (!file) return { ok: false, error: "Arquivo não encontrado." };
  if (mediaUsage(file) === "used") return { ok: false, error: "Este arquivo está em uso e não pode ser excluído." };

  const result = await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta });
  if (!result.ok) return { ok: false, error: result.error };
  refresh();
  return { ok: true, message: `${file.folder === "chat" ? "Anexo do chat" : file.name} excluído.` };
}

/** Exclui do servidor um arquivo que não tem registro no Workboard. */
export async function deleteUnregisteredFile(input: { key: string }): Promise<FilesActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isMediaConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ key: z.string().regex(MEDIA_KEY_PATTERN) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido." };

  const result = await deleteUnregisteredMedia(db, { key: parsed.data.key, actor: ctx.actor, meta: ctx.meta });
  if (!result.ok) return { ok: false, error: result.error };
  refresh();
  return { ok: true, message: `${parsed.data.key.startsWith("chat/") ? "Anexo do chat" : result.data.name} excluído.` };
}

/**
 * Limpeza geral: exclui os sem uso há mais de 24 h, registrados ou não, em
 * lotes. Devolve quantos saíram, quantos falharam e quantos ainda faltam.
 */
export async function deleteUnusedFiles(): Promise<
  { ok: true; deleted: number; failed: number; remaining: number } | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  if (!isMediaConfigured()) return NOT_CONFIGURED;

  const [library, listing] = await Promise.all([listMediaLibrary(db), listCdnFiles()]);
  // Sem a lista do servidor (list.php ausente ou fora do ar), só os registrados.
  const unregistered = listing.ok ? compareWithCdn(library, listing.data).unregistered : [];
  const pending = [
    ...library.filter((item) => mediaUsage(item) === "unused").map((item) => ({ id: item.id, key: item.key })),
    ...unregistered
      .filter((file) => unregisteredUsage(file) === "unregistered")
      .map((file) => ({ id: null, key: file.key })),
  ];
  const batch = pending.slice(0, CLEANUP_BATCH);
  let deleted = 0;
  for (const file of batch) {
    const result = file.id
      ? await deleteMedia(db, { id: file.id, actor: ctx.actor, meta: ctx.meta })
      : await deleteUnregisteredMedia(db, { key: file.key, actor: ctx.actor, meta: ctx.meta });
    if (result.ok) deleted++;
    else console.error("[arquivos] não foi possível excluir", file.key, result.error);
  }
  refresh();
  return { ok: true, deleted, failed: batch.length - deleted, remaining: pending.length - batch.length };
}
