import "server-only";

import { after } from "next/server";

import { db } from "@/db";
import { env } from "@/env";
import { formatMonth } from "@/lib/calendar";
import { requestCode } from "@/lib/client-requests";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { deliveryForApprovalEmail, planningForApprovalEmail } from "@/lib/email/templates";
import { excerpt, notificationHref, notificationText, type NotificationStatus } from "@/lib/notifications";
import { PORTAL_PLANNING_PATH, PORTAL_REQUESTS_PATH } from "@/lib/portal";
import type { PortalNotificationData, PortalNotificationType } from "@/lib/portal-notifications";
import { splitMentions } from "@/lib/jobs";
import { messageEffectOf, messageEffectText } from "@/lib/messages";
import type { PlanningStatus } from "@/lib/planning";
import type { RealtimeNotificationEvent } from "@/lib/realtime/protocol";
import { filterActiveUserIds, findUserNames, listMentionableIds } from "@/server/jobs";
import { listActiveAdminIds } from "@/server/client-requests";
import {
  insertNotifications,
  upsertJobMessageNotifications,
  upsertRequestMessageNotifications,
  type NewNotification,
  type NotificationRecord,
} from "@/server/notifications";
import { listActiveMemberIds } from "@/server/planning";
import { insertPortalNotifications, upsertPortalMessageNotifications } from "@/server/portal-notifications";
import { listActivePortalContacts } from "@/server/request-deliveries";
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
    tag: `${row.type}:${row.jobId ?? row.planningId ?? row.whiteboardId ?? row.clientRequestId ?? row.id}`,
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
    const effect = messageEffectOf(input.body, files);
    const preview = effect
      ? messageEffectText(effect)
      : excerpt(text) || (files === 1 ? "Enviou um arquivo." : files > 1 ? `Enviou ${files} arquivos.` : "");
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

// Solicitações do portal do cliente: quem recebe são os admins ativos (são eles
// que veem /solicitacoes), nunca quem fez. O contato do cliente não é um `user`:
// vem como ator sem id (o nome fica copiado).

type RequestRef = { id: string; number: number; title: string; clientName: string };
type RequestActor = { id: string | null; name: string };

function requestData(request: RequestRef) {
  return { requestNumber: request.number, requestTitle: request.title, clientName: request.clientName };
}

async function requestRecipients(actor: RequestActor) {
  return (await listActiveAdminIds(db)).filter((id) => id !== actor.id);
}

/** Solicitação nova (aberta pelo cliente) ou cancelada por ele. */
export function notifyRequestEvent(input: {
  type: "request.created" | "request.canceled";
  request: RequestRef;
  actor: RequestActor;
}) {
  const { request, actor } = input;
  later("solicitação", async () => {
    const recipients = await requestRecipients(actor);
    const rows = await insertNotifications(
      db,
      recipients.map((userId) => ({
        userId,
        type: input.type,
        actorId: actor.id,
        actorName: actor.name,
        jobId: null,
        clientRequestId: request.id,
        data: requestData(request),
      })),
    );
    await deliver(rows);
  });
}

/** Mensagem nova na conversa da solicitação (do cliente ou de alguém da equipe). */
export function notifyRequestMessage(input: { request: RequestRef; actor: RequestActor; body: string; attachmentCount: number }) {
  const { request, actor } = input;
  later("mensagem da solicitação", async () => {
    const recipients = await requestRecipients(actor);
    if (recipients.length === 0) return;
    const files = input.attachmentCount;
    const preview = excerpt(input.body) || (files === 1 ? "Enviou um arquivo." : files > 1 ? `Enviou ${files} arquivos.` : "");
    const rows = await upsertRequestMessageNotifications(db, {
      userIds: recipients,
      actorId: actor.id,
      actorName: actor.name,
      clientRequestId: request.id,
      data: { ...requestData(request), excerpt: preview },
    });
    await deliver(rows);
  });
}

/** O cliente respondeu uma rodada para aprovação (admins, como as outras das solicitações). */
export function notifyDeliveryAnswered(input: {
  request: RequestRef;
  actor: RequestActor;
  round: number;
  approved: number;
  changes: number;
}) {
  const { request, actor } = input;
  later("resposta da entrega", async () => {
    const recipients = await requestRecipients(actor);
    const rows = await insertNotifications(
      db,
      recipients.map((userId) => ({
        userId,
        type: "request.delivery_answered" as const,
        actorId: actor.id,
        actorName: actor.name,
        jobId: null,
        clientRequestId: request.id,
        data: { ...requestData(request), round: input.round, approved: input.approved, changes: input.changes },
      })),
    );
    await deliver(rows);
  });
}

// Portal do cliente: o sino do portal (contatos ativos do cliente da
// solicitação) e o e-mail de entrega para aprovar. Quem faz é sempre alguém da
// equipe. O portal não tem tempo real: o sino reconta sozinho de tempos em tempos.

type PortalRequestRef = { id: string; number: number; title: string; clientId: string; clientName: string };

function portalData(request: PortalRequestRef): PortalNotificationData {
  return { requestNumber: request.number, requestTitle: request.title };
}

/** Solicitação aberta pela equipe, status ou previsão de entrega mudados. */
export function notifyPortalContacts(input: {
  type: Exclude<PortalNotificationType, "request.message" | "request.delivery">;
  request: PortalRequestRef;
  actor: Actor;
  data?: Partial<PortalNotificationData>;
}) {
  const { request, actor } = input;
  later("portal", async () => {
    const contacts = await listActivePortalContacts(db, request.clientId);
    await insertPortalNotifications(
      db,
      contacts.map((contact) => ({
        portalUserId: contact.id,
        type: input.type,
        clientRequestId: request.id,
        actorId: actor.id,
        actorName: actor.name,
        data: { ...portalData(request), ...input.data },
      })),
    );
  });
}

/** Mensagem da equipe na conversa: soma na notificação ainda não lida de cada contato. */
export function notifyPortalMessage(input: { request: PortalRequestRef; actor: Actor; body: string; attachmentCount: number }) {
  const { request, actor } = input;
  later("mensagem no portal", async () => {
    const contacts = await listActivePortalContacts(db, request.clientId);
    const files = input.attachmentCount;
    const preview = excerpt(input.body) || (files === 1 ? "Enviou um arquivo." : files > 1 ? `Enviou ${files} arquivos.` : "");
    await upsertPortalMessageNotifications(db, {
      portalUserIds: contacts.map((contact) => contact.id),
      actorId: actor.id,
      actorName: actor.name,
      clientRequestId: request.id,
      data: { ...portalData(request), excerpt: preview },
    });
  });
}

/**
 * Rodada nova para aprovar: sino de todos os contatos ativos e e-mail para quem
 * pode aprovar (sem SMTP configurado, só o sino). Um e-mail que falha não
 * impede os outros.
 */
export function notifyPortalDelivery(input: { request: PortalRequestRef; actor: Actor; round: number; files: number }) {
  const { request, actor } = input;
  later("entrega no portal", async () => {
    const contacts = await listActivePortalContacts(db, request.clientId);
    await insertPortalNotifications(
      db,
      contacts.map((contact) => ({
        portalUserId: contact.id,
        type: "request.delivery" as const,
        clientRequestId: request.id,
        actorId: actor.id,
        actorName: actor.name,
        data: { ...portalData(request), round: input.round, files: input.files },
      })),
    );
    if (!isEmailConfigured()) return;
    const url = `${env.BETTER_AUTH_URL}${PORTAL_REQUESTS_PATH}/${request.number}#entregas`;
    for (const contact of contacts.filter((item) => item.canApprove)) {
      try {
        await sendEmail(
          deliveryForApprovalEmail({
            to: contact.email,
            name: contact.name,
            clientName: request.clientName,
            request: `${requestCode(request.number)} ${request.title}`,
            round: input.round,
            files: input.files,
            sentBy: actor.name,
            url,
          }),
        );
      } catch (error) {
        console.error("[email] falha no aviso de entrega", error);
      }
    }
  });
}

// Planejamentos no portal: a pauta ou as artes para aprovar (sino dos contatos
// ativos do cliente e e-mail para quem aprova) e as respostas do cliente (sino
// da equipe: os responsáveis do planejamento ou, sem eles, os admins).

/** Pauta ou artes do mês para aprovar. */
export function notifyPortalPlanning(input: {
  clientId: string;
  clientName: string;
  monthId: string;
  month: string;
  stage: "pauta" | "arte";
  posts: number;
  actor: Actor;
}) {
  const { actor } = input;
  later("planejamento no portal", async () => {
    const contacts = await listActivePortalContacts(db, input.clientId);
    await insertPortalNotifications(
      db,
      contacts.map((contact) => ({
        portalUserId: contact.id,
        type: input.stage === "pauta" ? ("planning.brief" as const) : ("planning.art" as const),
        planningMonthId: input.monthId,
        actorId: actor.id,
        actorName: actor.name,
        data: { month: input.month, posts: input.posts },
      })),
    );
    if (!isEmailConfigured()) return;
    const url = `${env.BETTER_AUTH_URL}${PORTAL_PLANNING_PATH}?mes=${input.month}`;
    for (const contact of contacts.filter((item) => item.canApprove)) {
      try {
        await sendEmail(
          planningForApprovalEmail({
            to: contact.email,
            name: contact.name,
            clientName: input.clientName,
            stage: input.stage,
            month: formatMonth(input.month),
            posts: input.posts,
            sentBy: actor.name,
            url,
          }),
        );
      } catch (error) {
        console.error("[email] falha no aviso de planejamento", error);
      }
    }
  });
}

/**
 * O cliente respondeu posts do planejamento (ou um admin registrou a resposta
 * dele): avisa os responsáveis ativos e, sem nenhum, os admins ativos. Nunca quem fez.
 */
export function notifyPlanningAnswered(input: {
  planning: PlanningRef;
  actor: { id: string | null; name: string };
  month: string;
  approved: number;
  changes: number;
  note: string | null;
}) {
  const { planning, actor } = input;
  later("resposta do planejamento", async () => {
    const members = await listActiveMemberIds(db, planning.id);
    const recipients = (members.length ? members : await listActiveAdminIds(db)).filter((id) => id !== actor.id);
    const rows = await insertNotifications(
      db,
      recipients.map((userId) => ({
        userId,
        type: "planning.answered" as const,
        actorId: actor.id,
        actorName: actor.name,
        jobId: null,
        planningId: planning.id,
        data: {
          clientName: planning.clientName,
          clientSlug: planning.clientSlug,
          month: input.month,
          approved: input.approved,
          changes: input.changes,
          ...(input.note ? { excerpt: excerpt(input.note) } : {}),
        },
      })),
    );
    await deliver(rows);
  });
}
