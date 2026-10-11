import { formatCalendarDate, formatDate, formatDateTime, formatMessageTime, formatTime } from "@/lib/format";
import { isOverdue, splitMentions } from "@/lib/jobs";
import { messageEffectOf, toReactionViews, type PinnedMessageView } from "@/lib/messages";
import type { JobListItem, JobMessageItem, JobPerson, JobRecord, JobStatusRecord } from "@/server/jobs";
import { resolveMediaUrl, toAttachmentView } from "@/server/media";
import type { MessageExtras, PinnedMessage } from "@/server/messages";
import type { JobFormValues, JobMessageView, JobPersonView, JobRow, JobStatusOption } from "./types";

export function toPersonView(person: JobPerson): JobPersonView {
  return { id: person.id, name: person.name, imageUrl: resolveMediaUrl(person.image) };
}

export function toStatusOption(status: JobStatusRecord): JobStatusOption {
  return {
    id: status.id,
    name: status.name,
    textColor: status.textColor,
    backgroundColor: status.backgroundColor,
    isFinal: status.isFinal,
    isCanceled: status.isCanceled,
    isDefault: status.isDefault,
  };
}

/** "AAAA-MM-DD" curto para a lista: "15/10" no ano de `today`, senão "15/10/25". */
function shortCalendarDate(value: string, today: string) {
  const [year, month, day] = value.split("-");
  return year === today.slice(0, 4) ? `${day}/${month}` : `${day}/${month}/${year.slice(2)}`;
}

/** Linha da lista; `today` em "AAAA-MM-DD" (fuso da agência) para marcar atrasos. */
export function toJobRow(item: JobListItem, today: string): JobRow {
  return {
    id: item.id,
    pit: item.pit,
    name: item.name,
    client: { name: item.client.name, slug: item.client.slug, logoUrl: resolveMediaUrl(item.client.logoKey) },
    statusId: item.status.id,
    assignees: item.assignees.map(toPersonView),
    createdAt: {
      date: formatDate(item.createdAt),
      time: formatTime(item.createdAt),
      absolute: formatDateTime(item.createdAt),
    },
    dueDate: item.dueDate ? { label: shortCalendarDate(item.dueDate, today), full: formatCalendarDate(item.dueDate) } : null,
    overdue: isOverdue(item.dueDate, item.status.isFinal, today),
    active: item.active,
    hasBriefing: Boolean(item.hasBriefing),
    messages: { total: item.messageTotal, unread: item.messageUnread, mentioned: Boolean(item.mentioned) },
  };
}

type JobWithAssignees = { job: JobRecord; assignees: JobPerson[] };

export function toFormValues({ job, assignees }: JobWithAssignees): JobFormValues {
  return {
    jobId: job.id,
    pit: job.pit,
    name: job.name,
    clientId: job.clientId,
    assigneeIds: assignees.map((person) => person.id),
    dueDate: job.dueDate ?? "",
    statusId: job.statusId,
    active: job.active,
    briefing: job.briefing ?? "",
  };
}

/**
 * Admin vê qualquer trabalho; o resto da equipe, só os em que está entre os
 * funcionários. Mesma regra de canAccessJob (actions), com os funcionários já carregados.
 */
export function canSeeJob(found: { assignees: { id: string }[] }, viewer: { id: string; role?: string | null }) {
  return viewer.role === "admin" || found.assignees.some((person) => person.id === viewer.id);
}

/** PIT da URL (/trabalhos/2559): só dígitos, senão null (a página dá 404). */
export function parsePit(value: string) {
  if (!/^\d{1,9}$/.test(value)) return null;
  const pit = Number(value);
  return pit >= 1 ? pit : null;
}

export function toMessageView(
  message: JobMessageItem,
  ctx: { viewerId: string; isAdmin: boolean; names: Map<string, string>; now: Date; extras: MessageExtras },
): JobMessageView {
  return {
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    authorImageUrl: resolveMediaUrl(message.authorImage),
    parts: splitMentions(message.body).map((part) =>
      part.type === "mention" ? { ...part, name: ctx.names.get(part.userId) ?? "alguém" } : part,
    ),
    effect: messageEffectOf(message.body, message.attachments.length),
    createdAt: message.createdAt.toISOString(),
    time: { label: formatMessageTime(message.createdAt, ctx.now), absolute: formatDateTime(message.createdAt) },
    attachments: message.attachments.map(toAttachmentView),
    canDelete: message.authorId === ctx.viewerId || ctx.isAdmin,
    reactions: toReactionViews(ctx.extras.reactions.get(message.id) ?? [], ctx.viewerId),
    pinned: Boolean(message.pinnedAt),
    favorite: ctx.extras.favorites.has(message.id),
  };
}

/** Texto corrido da mensagem, com as menções como "@Nome". */
export function mentionsAsText(body: string, names: Map<string, string>) {
  return splitMentions(body)
    .map((part) => (part.type === "mention" ? `@${names.get(part.userId) ?? "alguém"}` : part.text))
    .join("");
}

export function toPinnedMessageView(message: PinnedMessage, names: Map<string, string>): PinnedMessageView {
  return {
    id: message.id,
    authorName: message.authorName,
    text: mentionsAsText(message.body, names),
    attachments: message.attachments,
    time: formatDateTime(message.createdAt),
    pinnedBy: message.pinnedByName,
  };
}
