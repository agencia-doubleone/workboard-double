"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { planningMonth } from "@/db/schema";
import { getPortalSession } from "@/lib/portal-session";
import {
  draftDecisionSchema,
  submitAnswersSchema,
  type DraftDecisionInput,
  type SubmitAnswersInput,
} from "@/lib/validations/planning";
import { achievementsAfter, onPlanningMonthStatus } from "@/server/achievements";
import { getRequestMeta, recordAudit } from "@/server/audit";
import { notifyPlanningAnswered } from "@/server/notify";
import { markPortalPlanningNotificationsRead } from "@/server/portal-notifications";
import { findClientPendingSendPost, findClientPlanning, saveDraftDecision, submitClientAnswers } from "@/server/planning-sends";

// O planejamento, do lado do cliente (portal). O planejamento sai sempre da
// sessão do contato (o cliente dele), nunca do que o navegador manda: um post de
// outro cliente "não existe". Só quem pode aprovar (portal_user.canApprove)
// responde. As respostas ficam em rascunho (os contatos veem, a equipe não) até
// "Enviar respostas"; a equipe é avisada no sino.

export type PortalPlanningResult = { ok: true; message: string } | { ok: false; error: string };

const UNAUTHENTICATED = { ok: false, error: "Sua sessão expirou. Entre de novo." } as const;
const CANNOT_APPROVE = { ok: false, error: "Seu acesso é só para acompanhar: quem aprova é outra pessoa da sua empresa." } as const;
const NOT_FOUND = { ok: false, error: "Planejamento não encontrado." } as const;

async function getPortalContext() {
  const found = await getPortalSession();
  if (!found) return null;
  const { contact, client } = found;
  return {
    contact,
    client,
    actor: { id: contact.id, name: contact.name, email: contact.email, external: true },
    meta: getRequestMeta(await headers()),
  };
}

/** O mês do planejamento do cliente da sessão (só se já foi enviado a ele). */
async function findOwnMonth(clientId: string, month: string) {
  const found = await findClientPlanning(db, clientId);
  if (!found) return null;
  const [row] = await db
    .select()
    .from(planningMonth)
    .where(and(eq(planningMonth.planningId, found.planning.id), eq(planningMonth.month, month)))
    .limit(1);
  return row?.sharedAt ? { ...found, month: row } : null;
}

/** Aprovar, pedir alteração (com o que mudar) ou desfazer a resposta de um post. Fica em rascunho até "Enviar respostas". */
export async function decidePlanningPost(input: DraftDecisionInput): Promise<PortalPlanningResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.contact.canApprove) return CANNOT_APPROVE;
  const parsed = draftDecisionSchema.safeParse(input);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { ok: false, error: errors.comment?.[0] ?? "Resposta inválida." };
  }
  const found = await findClientPendingSendPost(db, { sendPostId: parsed.data.sendPostId, clientId: ctx.client.id });
  if (!found) return { ok: false, error: "Este post não está mais esperando resposta. Recarregue a página." };

  await saveDraftDecision(db, {
    sendPostId: found.sendPost.id,
    postId: found.sendPost.postId,
    stage: found.sendPost.stage,
    decision: parsed.data.decision,
    comment: parsed.data.comment,
    contact: ctx.contact,
  });
  refresh();
  return { ok: true, message: parsed.data.decision ? "Resposta guardada. Envie quando terminar." : "Resposta desfeita." };
}

/**
 * Envia à equipe as respostas do mês (as que já foram dadas; o resto continua
 * esperando). Com `approveRest` ("Aprovar tudo"), aprova antes os posts ainda
 * sem resposta. Avisa os responsáveis do planejamento (ou os admins).
 */
export async function submitPlanningAnswers(input: SubmitAnswersInput): Promise<PortalPlanningResult> {
  const ctx = await getPortalContext();
  if (!ctx) return UNAUTHENTICATED;
  if (!ctx.contact.canApprove) return CANNOT_APPROVE;
  const parsed = submitAnswersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Envio inválido." };
  const found = await findOwnMonth(ctx.client.id, parsed.data.month);
  if (!found) return NOT_FOUND;

  const result = await submitClientAnswers(db, {
    monthId: found.month.id,
    contact: ctx.contact,
    note: parsed.data.note,
    approveRest: parsed.data.approveRest,
  });
  if (!result.ok) return result;
  await recordAudit({
    action: "planning.answered",
    actor: ctx.actor,
    entity: { type: "planning", id: found.planning.id, label: found.client.name },
    metadata: { clientId: ctx.client.id, month: parsed.data.month, approved: result.approved, changes: result.changes },
    ...ctx.meta,
  });
  notifyPlanningAnswered({
    planning: { id: found.planning.id, clientName: found.client.name, clientSlug: found.client.slug },
    actor: { id: null, name: ctx.contact.name },
    month: parsed.data.month,
    approved: result.approved,
    changes: result.changes,
    note: parsed.data.note,
  });
  // O mês aprovado sem nenhum ajuste vale "Aprovado de Primeira" para os responsáveis.
  for (const month of result.months) {
    achievementsAfter("status do mês", (database) => onPlanningMonthStatus(database, month));
  }

  refresh();
  const total = result.approved + result.changes;
  return { ok: true, message: `${total === 1 ? "Resposta enviada" : `${total} respostas enviadas`} à Double One. Obrigado!` };
}

/** Abrir o mês dá como vistas as notificações dele no sino do portal. */
export async function markPlanningMonthRead(input: { month: string }): Promise<void> {
  const ctx = await getPortalContext();
  if (!ctx || typeof input?.month !== "string") return;
  const found = await findOwnMonth(ctx.client.id, input.month);
  if (found) await markPortalPlanningNotificationsRead(db, ctx.contact.id, found.month.id);
}
