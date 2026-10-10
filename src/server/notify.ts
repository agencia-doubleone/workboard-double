import "server-only";

import { after } from "next/server";

import { db } from "@/db";
import { excerpt, notificationHref, notificationText, type NotificationStatus } from "@/lib/notifications";
import { splitMentions } from "@/lib/jobs";
import type { PlanningStatus } from "@/lib/planning";
import type { RealtimeNotificationEvent } from "@/lib/realtime/protocol";
import { filterActiveUserIds, findUserNames, listMentionableIds } from "@/server/jobs";
import {
  insertNotifications,
  upsertJobMessageNotifications,
  type NewNotification,
  type NotificationRecord,
} from "@/server/notifications";
import { listActiveMemberIds } from "@/server/planning";
import { publishRealtime } from "@/server/realtime";

// Notificações dos trabalhos: grava no banco e avisa em tempo real quem recebe.
// Roda depois da resposta (after) e nunca lança erro: a ação principal já deu
// certo. Quem fez a ação nunca é notificado, e só recebe quem está ativo.

type JobRef = { id: string; pit: number; name: string };
type Actor = { id: string; name: string };

function later(label: string, task: () => Promise<void>) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[notificações] ${label}`, error);
    }
  });
}

function toEvent(row: NotificationRecord): RealtimeNotificationEvent {
  return {
    type: "notification",
    ...notificationText(row),
    href: notificationHref(row),
    jobId: row.jobId,
    tag: `${row.type}:${row.jobId ?? row.planningId ?? row.whiteboardId ?? row.id}`,
  };
}

/** Avisa cada pessoa; quem recebe o mesmo texto vai num pedido só ao Worker. */
async function deliver(rows: NotificationRecord[]) {
  const groups = new Map<string, { event: RealtimeNotificationEvent; to: string[] }>();
  for (const row of rows) {
    const event = toEvent(row);
    const key = JSON.stringify(event);
    const group = groups.get(key) ?? { event, to: [] };
    group.to.push(row.userId);
    groups.set(key, group);
  }
  await Promise.all([...groups.values()].map(({ event, to }) => publishRealtime(to, event)));
}

function jobData(job: JobRef) {
  return { pit: job.pit, jobName: job.name };
}

/** Entrou ou saiu do trabalho. */
export function notifyAssignments(input: { job: JobRef; actor: Actor; addedIds: string[]; removedIds: string[] }) {
  const { job, actor } = input;
  const added = input.addedIds.filter((id) => id !== actor.id);
  const removed = input.removedIds.filter((id) => id !== actor.id);
  if (added.length === 0 && removed.length === 0) return;
  later("vínculos", async () => {
    const [addedActive, removedActive] = await Promise.all([
      filterActiveUserIds(db, added),
      filterActiveUserIds(db, removed),
    ]);
    const base = { actorId: actor.id, actorName: actor.name, jobId: job.id, data: jobData(job) };
    const rows = await insertNotifications(db, [
      ...addedActive.map((userId): NewNotification => ({ ...base, userId, type: "job.assigned" })),
      ...removedActive.map((userId): NewNotification => ({ ...base, userId, type: "job.unassigned" })),
    ]);
    await deliver(rows);
  });
}

/** Status trocado: avisa os funcionários do trabalho (menos `skipIds`, ex.: quem acabou de entrar). */
export function notifyStatusChange(input: { job: JobRef; actor: Actor; status: NotificationStatus; skipIds?: string[] }) {
  const { job, actor, status } = input;
  later("status", async () => {
    const skip = new Set([actor.id, ...(input.skipIds ?? [])]);
    const recipients = (await listMentionableIds(db, job.id)).filter((id) => !skip.has(id));
    const rows = await insertNotifications(
      db,
      recipients.map((userId) => ({
        userId,
        type: "job.status_changed",
        actorId: actor.id,
        actorName: actor.name,
        jobId: job.id,
        data: {
          ...jobData(job),
          status: { name: status.name, textColor: status.textColor, backgroundColor: status.backgroundColor },
        },
      })),
    );
    await deliver(rows);
  });
}

/**
 * Mensagem nova: quem foi mencionado recebe "mencionou você"; os outros
 * funcionários, a notificação de mensagens do trabalho (somada enquanto não lerem).
 */
export function notifyJobMessage(input: {
  job: JobRef;
  actor: Actor;
  body: string;
  attachmentCount: number;
  mentionIds: string[];
}) {
  const { job, actor } = input;
  later("mensagem", async () => {
    const recipients = (await listMentionableIds(db, job.id)).filter((id) => id !== actor.id);
    if (recipients.length === 0) return;
    const names = await findUserNames(db, input.mentionIds);
    const text = splitMentions(input.body)
      .map((part) => (part.type === "mention" ? `@${names.get(part.userId) ?? "alguém"}` : part.text))
      .join("");
    const files = input.attachmentCount;
    const preview =
      excerpt(text) || (files === 1 ? "Enviou um arquivo." : files > 1 ? `Enviou ${files} arquivos.` : "");
    const data = { ...jobData(job), excerpt: preview };
    const mentioned = new Set(input.mentionIds);

    const [mentions, messages] = await Promise.all([
      insertNotifications(
        db,
        recipients
          .filter((id) => mentioned.has(id))
          .map((userId) => ({ userId, type: "job.mention", actorId: actor.id, actorName: actor.name, jobId: job.id, data })),
      ),
      upsertJobMessageNotifications(db, {
        userIds: recipients.filter((id) => !mentioned.has(id)),
        actorId: actor.id,
        actorName: actor.name,
        jobId: job.id,
        data,
      }),
    ]);
    await deliver([...mentions, ...messages]);
  });
}

type PlanningRef = { id: string; clientName: string; clientSlug: string };

/** Incluído como responsável num planejamento (ao criar ou ao editar). */
export function notifyPlanningMembers(input: { planning: PlanningRef; actor: Actor; userIds: string[] }) {
  const { planning, actor } = input;
  const recipients = input.userIds.filter((id) => id !== actor.id);
  if (recipients.length === 0) return;
  later("responsáveis", async () => {
    const active = await filterActiveUserIds(db, recipients);
    const rows = await insertNotifications(
      db,
      active.map((userId) => ({
        userId,
        type: "planning.assigned",
        actorId: actor.id,
        actorName: actor.name,
        jobId: null,
        planningId: planning.id,
        data: { clientName: planning.clientName, clientSlug: planning.clientSlug },
      })),
    );
    await deliver(rows);
  });
}

/**
 * Planejamento: mês ou post mudou de status. Avisa os responsáveis ativos do
 * planejamento (menos quem mudou). `post` ausente = o mês.
 */
export function notifyPlanningStatus(input: {
  planning: PlanningRef;
  actor: Actor;
  month: string;
  status: PlanningStatus;
  post?: { headline: string; date: string | null };
}) {
  const { planning, actor, post } = input;
  later("planejamento", async () => {
    const recipients = (await listActiveMemberIds(db, planning.id)).filter((id) => id !== actor.id);
    const rows = await insertNotifications(
      db,
      recipients.map((userId) => ({
        userId,
        type: post ? "planning.post_status" : "planning.month_status",
        actorId: actor.id,
        actorName: actor.name,
        jobId: null,
        planningId: planning.id,
        data: {
          clientName: planning.clientName,
          clientSlug: planning.clientSlug,
          month: input.month,
          planningStatus: input.status,
          ...(post ? { headline: post.headline, postDate: post.date ?? undefined } : {}),
        },
      })),
    );
    await deliver(rows);
  });
}

/** Incluído num quadro branco (acesso "pessoas escolhidas"). */
export function notifyWhiteboardShared(input: { board: { id: string; title: string }; actor: Actor; userIds: string[] }) {
  const { board, actor } = input;
  const recipients = input.userIds.filter((id) => id !== actor.id);
  if (recipients.length === 0) return;
  later("quadro", async () => {
    const active = await filterActiveUserIds(db, recipients);
    const rows = await insertNotifications(
      db,
      active.map((userId) => ({
        userId,
        type: "whiteboard.shared",
        actorId: actor.id,
        actorName: actor.name,
        jobId: null,
        whiteboardId: board.id,
        data: { boardId: board.id, boardTitle: board.title },
      })),
    );
    await deliver(rows);
  });
}
