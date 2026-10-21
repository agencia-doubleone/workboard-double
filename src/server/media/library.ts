import { desc, eq, isNotNull, like } from "drizzle-orm";

import type { Database } from "@/db";
import {
  chatMessageAttachment,
  client,
  clientRequest,
  clientRequestDelivery,
  clientRequestDeliveryFile,
  clientRequestMessage,
  clientRequestMessageAttachment,
  job,
  jobMessage,
  jobMessageAttachment,
  media,
  planning,
  planningMonth,
  planningPost,
  planningPostAsset,
  portalUser,
  user,
} from "@/db/schema";
import { listWhiteboardImages } from "@/server/whiteboards";

// Biblioteca de arquivos (admins): todo arquivo registrado em `media` com os
// lugares em que ele aparece. Sem uso = nada no sistema aponta para ele (anexo
// tirado do rascunho sem apagar, foto trocada, imagem que saiu do texto...).
// Sem "server-only": também roda nos scripts de verificação contra PGlite.
//
// Onde um arquivo pode estar (um lugar novo que guarde arquivo entra aqui):
// - user.image, portal_user.image (foto do contato no portal) e client.logoKey guardam a chave do CDN;
// - anexos de mensagens (trabalhos, chat e solicitações) apontam para media.id;
// - textos ricos (job.briefing, client.notes, client_request.briefing) têm a URL com /uploads/<chave>;
// - imagens dos quadros brancos guardam a chave em `fileId` (whiteboard_element.data);
// - artes dos posts dos planejamentos (planning_post_asset, todas as versões) apontam para media.id.

export type MediaUse =
  | { kind: "avatar"; userName: string }
  | { kind: "portal-avatar"; contactName: string; clientName: string; clientSlug: string }
  | { kind: "logo"; clientName: string; clientSlug: string }
  | { kind: "client-notes"; clientName: string; clientSlug: string }
  | { kind: "job-attachment"; pit: number; jobName: string }
  | { kind: "job-briefing"; pit: number; jobName: string }
  | { kind: "chat" }
  | { kind: "request-attachment"; number: number; title: string }
  | { kind: "request-briefing"; number: number; title: string }
  | { kind: "request-delivery"; number: number; title: string; round: number }
  | { kind: "planning-art"; clientName: string; clientSlug: string; month: string; headline: string }
  /** Quadro pessoal é privado (nem admin abre): sem nome nem link. */
  | { kind: "whiteboard"; whiteboardId: string; title: string; private: boolean };

/** Sem uso e mais novo que isso: pode estar no rascunho de alguém (ainda não enviado). */
export const MEDIA_DRAFT_GRACE_MS = 24 * 60 * 60 * 1000;

/** Chave do CDN dentro de um texto (mesmo formato de MEDIA_KEY_PATTERN em keys.ts). */
const KEY_IN_HTML = /\/uploads\/([a-z0-9-]+\/\d{4}\/\d{2}\/[a-z0-9]{16}-[a-z0-9-]{1,60}\.[a-z0-9]{2,5})/g;

function keysInHtml(html: string | null) {
  return html ? [...html.matchAll(KEY_IN_HTML)].map((match) => match[1]) : [];
}

export async function listMediaLibrary(database: Database) {
  const [files, avatars, portalAvatars, logos, jobAttachments, chatAttachments, briefings, clientNotes, boardImages] = await Promise.all([
    database
      .select({
        id: media.id,
        key: media.key,
        folder: media.folder,
        name: media.name,
        type: media.type,
        size: media.size,
        createdAt: media.createdAt,
        uploadedById: media.uploadedById,
        uploadedByName: user.name,
        uploadedByPortalName: portalUser.name,
      })
      .from(media)
      .leftJoin(user, eq(user.id, media.uploadedById))
      .leftJoin(portalUser, eq(portalUser.id, media.uploadedByPortalUserId))
      .orderBy(desc(media.createdAt)),
    database.select({ key: user.image, name: user.name }).from(user).where(isNotNull(user.image)),
    database
      .select({ key: portalUser.image, name: portalUser.name, clientName: client.name, clientSlug: client.slug })
      .from(portalUser)
      .innerJoin(client, eq(client.id, portalUser.clientId))
      .where(isNotNull(portalUser.image)),
    database
      .select({ key: client.logoKey, name: client.name, slug: client.slug })
      .from(client)
      .where(isNotNull(client.logoKey)),
    database
      .selectDistinct({ mediaId: jobMessageAttachment.mediaId, pit: job.pit, name: job.name })
      .from(jobMessageAttachment)
      .innerJoin(jobMessage, eq(jobMessage.id, jobMessageAttachment.messageId))
      .innerJoin(job, eq(job.id, jobMessage.jobId)),
    database.selectDistinct({ mediaId: chatMessageAttachment.mediaId }).from(chatMessageAttachment),
    database
      .select({ pit: job.pit, name: job.name, html: job.briefing })
      .from(job)
      .where(like(job.briefing, "%/uploads/%")),
    database
      .select({ name: client.name, slug: client.slug, html: client.notes })
      .from(client)
      .where(like(client.notes, "%/uploads/%")),
    listWhiteboardImages(database),
  ]);
  const [requestAttachments, requestBriefings, deliveryFiles, planningArt] = await Promise.all([
    database
      .selectDistinct({
        mediaId: clientRequestMessageAttachment.mediaId,
        number: clientRequest.number,
        title: clientRequest.title,
      })
      .from(clientRequestMessageAttachment)
      .innerJoin(clientRequestMessage, eq(clientRequestMessage.id, clientRequestMessageAttachment.messageId))
      .innerJoin(clientRequest, eq(clientRequest.id, clientRequestMessage.requestId)),
    database
      .select({ number: clientRequest.number, title: clientRequest.title, html: clientRequest.briefing })
      .from(clientRequest)
      .where(like(clientRequest.briefing, "%/uploads/%")),
    database
      .select({
        mediaId: clientRequestDeliveryFile.mediaId,
        number: clientRequest.number,
        title: clientRequest.title,
        round: clientRequestDelivery.round,
      })
      .from(clientRequestDeliveryFile)
      .innerJoin(clientRequestDelivery, eq(clientRequestDelivery.id, clientRequestDeliveryFile.deliveryId))
      .innerJoin(clientRequest, eq(clientRequest.id, clientRequestDelivery.requestId))
      .where(isNotNull(clientRequestDeliveryFile.mediaId)),
    database
      .selectDistinct({
        mediaId: planningPostAsset.mediaId,
        postId: planningPost.id,
        headline: planningPost.headline,
        month: planningMonth.month,
        clientName: client.name,
        clientSlug: client.slug,
      })
      .from(planningPostAsset)
      .innerJoin(planningPost, eq(planningPost.id, planningPostAsset.postId))
      .innerJoin(planningMonth, eq(planningMonth.id, planningPost.monthId))
      .innerJoin(planning, eq(planning.id, planningMonth.planningId))
      .innerJoin(client, eq(client.id, planning.clientId))
      .where(isNotNull(planningPostAsset.mediaId)),
  ]);

  const byKey = new Map<string, MediaUse[]>();
  const byId = new Map<string, MediaUse[]>();
  const add = (map: Map<string, MediaUse[]>, id: string, use: MediaUse) => map.set(id, [...(map.get(id) ?? []), use]);

  for (const row of avatars) if (row.key) add(byKey, row.key, { kind: "avatar", userName: row.name });
  for (const row of portalAvatars) {
    if (row.key) {
      add(byKey, row.key, { kind: "portal-avatar", contactName: row.name, clientName: row.clientName, clientSlug: row.clientSlug });
    }
  }
  for (const row of logos) {
    if (row.key) add(byKey, row.key, { kind: "logo", clientName: row.name, clientSlug: row.slug });
  }
  for (const row of jobAttachments) add(byId, row.mediaId, { kind: "job-attachment", pit: row.pit, jobName: row.name });
  for (const row of chatAttachments) add(byId, row.mediaId, { kind: "chat" });
  for (const row of requestAttachments) {
    add(byId, row.mediaId, { kind: "request-attachment", number: row.number, title: row.title });
  }
  for (const row of deliveryFiles) {
    if (!row.mediaId) continue;
    add(byId, row.mediaId, { kind: "request-delivery", number: row.number, title: row.title, round: row.round });
  }
  for (const row of planningArt) {
    if (!row.mediaId) continue;
    add(byId, row.mediaId, {
      kind: "planning-art",
      clientName: row.clientName,
      clientSlug: row.clientSlug,
      month: row.month,
      headline: row.headline,
    });
  }
  for (const row of requestBriefings) {
    for (const key of new Set(keysInHtml(row.html))) {
      add(byKey, key, { kind: "request-briefing", number: row.number, title: row.title });
    }
  }
  for (const row of briefings) {
    for (const key of new Set(keysInHtml(row.html))) add(byKey, key, { kind: "job-briefing", pit: row.pit, jobName: row.name });
  }
  for (const row of clientNotes) {
    for (const key of new Set(keysInHtml(row.html))) {
      add(byKey, key, { kind: "client-notes", clientName: row.name, clientSlug: row.slug });
    }
  }

  for (const row of boardImages) {
    add(byKey, row.key, {
      kind: "whiteboard",
      whiteboardId: row.whiteboardId,
      title: row.title,
      private: row.access === "private",
    });
  }

  return files.map((file) => ({ ...file, uses: [...(byId.get(file.id) ?? []), ...(byKey.get(file.key) ?? [])] }));
}

export type MediaLibraryItem = Awaited<ReturnType<typeof listMediaLibrary>>[number];

export type MediaUsage = "used" | "unused" | "recent";

/** Em uso; sem uso; ou sem uso mas recente (talvez num rascunho ainda não enviado). */
export function mediaUsage(item: { uses: MediaUse[]; createdAt: Date }, now = new Date()): MediaUsage {
  if (item.uses.length > 0) return "used";
  return now.getTime() - item.createdAt.getTime() < MEDIA_DRAFT_GRACE_MS ? "recent" : "unused";
}

/** Arquivo que está em uploads/ no CDN mas não tem registro em `media`. */
export type UnregisteredFile = { key: string; folder: string; name: string; size: number; createdAt: Date };

/** "k3j9x0q2m8w1a7zc-briefing.pdf" → "briefing.pdf" (o nome legível que vem na chave). */
export function nameFromKey(key: string) {
  const file = key.split("/").pop() ?? key;
  return file.replace(/^[a-z0-9]{16}-/, "");
}

/**
 * Cruza o banco com a lista do CDN (list.php): registros cujo arquivo não está
 * lá (link quebrado) e arquivos que estão lá sem registro (envio que não
 * terminou, algo posto pelo FTP). Com a lista cortada, ninguém é dado como sumido.
 */
export function compareWithCdn(
  library: MediaLibraryItem[],
  listing: { files: { key: string; size: number; modifiedAt: Date }[]; truncated: boolean },
) {
  const onCdn = new Set(listing.files.map((file) => file.key));
  const registered = new Set(library.map((item) => item.key));
  return {
    missingIds: new Set(listing.truncated ? [] : library.filter((item) => !onCdn.has(item.key)).map((item) => item.id)),
    unregistered: listing.files
      .filter((file) => !registered.has(file.key))
      .map(
        (file): UnregisteredFile => ({
          key: file.key,
          folder: file.key.split("/")[0],
          name: nameFromKey(file.key),
          size: file.size,
          createdAt: file.modifiedAt,
        }),
      ),
  };
}

/** Sem registro e antigo: esquecido. Recente: pode ser um envio terminando agora. */
export function unregisteredUsage(file: { createdAt: Date }, now = new Date()): "unregistered" | "recent" {
  return now.getTime() - file.createdAt.getTime() < MEDIA_DRAFT_GRACE_MS ? "recent" : "unregistered";
}
