import { formatCalendarDate, formatDate, formatDateTime } from "@/lib/format";
import { isOverdue, splitMentions } from "@/lib/jobs";
import { formatBytes } from "@/lib/media";
import type { JobListItem, JobMessageItem, JobPerson, JobRecord, JobStatusRecord } from "@/server/jobs";
import { getMediaUrl, resolveMediaUrl } from "@/server/media";
import type { JobFormValues, JobMessageView, JobPersonView, JobRow, JobStatusOption } from "./types";

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" });

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
      time: timeFormat.format(item.createdAt),
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

/** PIT da URL (/trabalhos/2559): só dígitos, senão null (a página dá 404). */
export function parsePit(value: string) {
  if (!/^\d{1,9}$/.test(value)) return null;
  const pit = Number(value);
  return pit >= 1 ? pit : null;
}

const TIME_ZONE = "America/Sao_Paulo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, dateStyle: "short" });

/** "hoje, 14:32", "ontem, 09:10", "08/10, 14:32" (ou com ano, se de outro ano). */
export function formatMessageTime(date: Date, now: Date) {
  const time = timeFormat.format(date);
  const day = dayKey.format(date);
  if (day === dayKey.format(now)) return `hoje, ${time}`;
  if (day === dayKey.format(new Date(now.getTime() - 86_400_000))) return `ontem, ${time}`;
  const sameYear = day.slice(0, 4) === dayKey.format(now).slice(0, 4);
  return `${sameYear ? shortDate.format(date) : fullDate.format(date)}, ${time}`;
}

export function toMessageView(
  message: JobMessageItem,
  ctx: { viewerId: string; isAdmin: boolean; names: Map<string, string>; now: Date },
): JobMessageView {
  return {
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    authorImageUrl: resolveMediaUrl(message.authorImage),
    parts: splitMentions(message.body).map((part) =>
      part.type === "mention" ? { ...part, name: ctx.names.get(part.userId) ?? "alguém" } : part,
    ),
    createdAt: message.createdAt.toISOString(),
    time: { label: formatMessageTime(message.createdAt, ctx.now), absolute: formatDateTime(message.createdAt) },
    attachments: message.attachments.map((file) => ({
      id: file.id,
      url: getMediaUrl(file.key),
      name: file.name,
      size: formatBytes(file.size),
      isImage: file.type.startsWith("image/") && file.type !== "image/vnd.adobe.photoshop",
    })),
    canDelete: message.authorId === ctx.viewerId || ctx.isAdmin,
  };
}
