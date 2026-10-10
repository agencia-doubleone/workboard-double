import { formatDateTime, formatRelative } from "@/lib/format";
import { resolveMediaUrl } from "@/server/media";
import type { WhiteboardListItem } from "@/server/whiteboards";
import type { WhiteboardCardView, WhiteboardPersonView } from "./types";

export function toPersonView(person: { id: string; name: string; image: string | null }): WhiteboardPersonView {
  return { id: person.id, name: person.name, imageUrl: resolveMediaUrl(person.image) };
}

export function previewUrlOf(board: { id: string; previewUpdatedAt: Date | null }) {
  return board.previewUpdatedAt ? `/api/quadros/${board.id}/miniatura?v=${board.previewUpdatedAt.getTime()}` : null;
}

export function toCardView(item: WhiteboardListItem, now: Date): WhiteboardCardView {
  return {
    id: item.id,
    title: item.title,
    access: item.access,
    owner: item.ownerId && item.ownerName ? toPersonView({ id: item.ownerId, name: item.ownerName, image: item.ownerImage }) : null,
    job: item.job ? { pit: item.job.pit, name: item.job.name } : null,
    members: item.members.map(toPersonView),
    previewUrl: item.hasPreview ? previewUrlOf(item) : null,
    updated: { label: formatRelative(item.contentUpdatedAt, now), absolute: formatDateTime(item.contentUpdatedAt) },
    updatedBy: item.contentUpdatedByName,
  };
}
