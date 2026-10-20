import { formatBytes, getFileExtension, isPreviewableImage, MEDIA_FOLDER_LABELS, MEDIA_FOLDERS, type MediaFolder } from "@/lib/media";
import { formatDate, formatDateTime } from "@/lib/format";
import { getMediaUrl } from "@/server/media";
import {
  mediaUsage,
  unregisteredUsage,
  type MediaLibraryItem,
  type MediaUse,
  type UnregisteredFile,
} from "@/server/media/library";
import type { FileUseView, FileView, FilesSummary } from "./types";

function toUseView(use: MediaUse): FileUseView {
  switch (use.kind) {
    case "avatar":
      return { label: `Foto de perfil de ${use.userName}`, href: "/usuarios" };
    case "portal-avatar":
      return { label: `Foto de ${use.contactName} no portal (${use.clientName})`, href: `/clientes/${use.clientSlug}` };
    case "logo":
      return { label: `Logo de ${use.clientName}`, href: `/clientes/${use.clientSlug}` };
    case "client-notes":
      return { label: `Observações de ${use.clientName}`, href: `/clientes/${use.clientSlug}` };
    case "job-attachment":
      return { label: `Anexo no #${use.pit} ${use.jobName}`, href: `/trabalhos/${use.pit}#mensagens` };
    case "job-briefing":
      return { label: `Briefing do #${use.pit} ${use.jobName}`, href: `/trabalhos/${use.pit}` };
    case "chat":
      return { label: "Mensagem do chat (privada)", href: null };
    case "request-attachment":
      return { label: `Anexo na S-${use.number} ${use.title}`, href: `/solicitacoes/${use.number}#mensagens` };
    case "request-briefing":
      return { label: `Briefing da S-${use.number} ${use.title}`, href: `/solicitacoes/${use.number}` };
    case "request-delivery":
      return {
        label: `Rodada ${use.round} para aprovação da S-${use.number} ${use.title}`,
        href: `/solicitacoes/${use.number}#entregas`,
      };
    case "whiteboard":
      return use.private
        ? { label: "Quadro pessoal (privado)", href: null }
        : { label: `Quadro “${use.title}”`, href: `/quadros/${use.whiteboardId}` };
  }
}

/** Só em quadros pessoais: privado como o chat (sem nome, prévia nem link). */
export function isPrivateBoardImage(uses: MediaUse[]) {
  return uses.length > 0 && uses.every((use) => use.kind === "whiteboard" && use.private);
}

function folderOf(value: string): MediaFolder {
  return MEDIA_FOLDERS.includes(value as MediaFolder) ? (value as MediaFolder) : "geral";
}

/**
 * Campos comuns aos registrados e aos sem registro. O chat e os quadros pessoais
 * são privados até para admins.
 */
function baseView(
  file: { key: string; folder: string; name: string; size: number; createdAt: Date },
  previewable: boolean,
  privateBoard = false,
) {
  const folder = folderOf(file.folder);
  const isPrivate = folder === "chat" || privateBoard;
  const url = getMediaUrl(file.key);
  return {
    key: file.key,
    private: isPrivate,
    name: privateBoard ? "Imagem de quadro pessoal" : isPrivate ? "Anexo do chat" : file.name,
    extension: getFileExtension(file.name).toUpperCase(),
    url: isPrivate ? null : url,
    thumbUrl: !isPrivate && previewable ? url : null,
    folder,
    folderLabel: MEDIA_FOLDER_LABELS[folder],
    size: formatBytes(file.size),
    createdAt: { label: formatDate(file.createdAt), absolute: formatDateTime(file.createdAt) },
  };
}

export function toFileView(item: MediaLibraryItem, ctx: { now: Date; missing: boolean }): FileView {
  const base = baseView(item, isPreviewableImage(item.type), isPrivateBoardImage(item.uses));
  return {
    ...base,
    id: item.id,
    registered: true,
    missing: ctx.missing,
    // Sumido do servidor: o link não abre e a miniatura não carrega.
    url: ctx.missing ? null : base.url,
    thumbUrl: ctx.missing ? null : base.thumbUrl,
    uploadedBy: item.uploadedByName ?? (item.uploadedByPortalName ? `${item.uploadedByPortalName} (portal do cliente)` : null),
    usage: mediaUsage(item, ctx.now),
    uses: item.uses.map(toUseView),
  };
}

export function toUnregisteredView(file: UnregisteredFile, now: Date): FileView {
  const extension = getFileExtension(file.name);
  return {
    ...baseView(file, ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(extension)),
    id: `cdn:${file.key}`,
    registered: false,
    missing: false,
    uploadedBy: null,
    usage: unregisteredUsage(file, now),
    uses: [],
  };
}

export function summarize(
  library: MediaLibraryItem[],
  unregistered: UnregisteredFile[],
  ctx: { now: Date; missing: number },
): FilesSummary {
  const sum = (list: { size: number }[]) => list.reduce((total, item) => total + item.size, 0);
  const used = library.filter((item) => mediaUsage(item, ctx.now) === "used");
  const unused = library.filter((item) => mediaUsage(item, ctx.now) === "unused");
  const forgotten = unregistered.filter((file) => unregisteredUsage(file, ctx.now) === "unregistered");
  const recent =
    library.filter((item) => mediaUsage(item, ctx.now) === "recent").length +
    unregistered.filter((file) => unregisteredUsage(file, ctx.now) === "recent").length;
  return {
    total: { count: library.length + unregistered.length, size: formatBytes(sum(library) + sum(unregistered)) },
    used: { count: used.length, size: formatBytes(sum(used)) },
    unused: {
      count: unused.length + forgotten.length,
      size: formatBytes(sum(unused) + sum(forgotten)),
      unregistered: forgotten.length,
    },
    recent: { count: recent },
    missing: ctx.missing,
  };
}
