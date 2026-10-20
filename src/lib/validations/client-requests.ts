import { z } from "zod";

import {
  DELIVERY_COMMENT_MAX_LENGTH,
  DELIVERY_FILES_MAX,
  DELIVERY_NOTE_MAX_LENGTH,
  REQUEST_BRIEFING_MAX_LENGTH,
  REQUEST_STATUS_KEYS,
  REQUEST_TITLE_MAX_LENGTH,
} from "@/lib/client-requests";
import { MESSAGE_ATTACHMENTS_MAX, MESSAGE_MAX_LENGTH } from "@/lib/jobs";

// Solicitações: o que o cliente manda pelo portal e o que a equipe muda.

const requestId = z.uuid("Solicitação inválida.");

const title = z
  .string()
  .trim()
  .min(3, "Escreva o assunto da solicitação.")
  .max(REQUEST_TITLE_MAX_LENGTH, `Use até ${REQUEST_TITLE_MAX_LENGTH} caracteres.`);

/** HTML do editor; o servidor limpa antes de salvar (sanitizeRichText). */
const briefing = z.string().max(REQUEST_BRIEFING_MAX_LENGTH, "O briefing ficou longo demais.");

const status = z.enum(REQUEST_STATUS_KEYS, "Status inválido.");

/** Previsão de entrega ("AAAA-MM-DD" do DatePicker); em branco = sem previsão. */
const expectedOn = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.iso
    .date("Informe uma data válida.")
    .refine((value) => value >= "2000-01-01" && value <= "2100-12-31", "Informe uma data entre 2000 e 2100.")
    .nullable(),
);

/** O cliente, pelo portal: o briefing é obrigatório (o servidor recusa se não sobrar nada depois de limpar). */
export const createClientRequestSchema = z.object({ title, briefing });
export type CreateClientRequestInput = z.input<typeof createClientRequestSchema>;

/**
 * A equipe, ao cadastrar em nome do cliente ou editar: escolhe o cliente e já
 * pode pôr status e previsão; o briefing é opcional.
 */
export const teamRequestSchema = z.object({
  clientId: z.uuid("Escolha o cliente."),
  title,
  briefing,
  status,
  expectedOn,
});
export type TeamRequestInput = z.input<typeof teamRequestSchema>;

export const updateRequestSchema = teamRequestSchema.extend({ requestId });
export type UpdateRequestInput = z.input<typeof updateRequestSchema>;

export const requestTargetSchema = z.object({ requestId });

export const setRequestStatusSchema = z.object({ requestId, status });

export const setRequestExpectedOnSchema = z.object({ requestId, expectedOn });

export const sendRequestMessageSchema = z.object({
  requestId,
  body: z.string().trim().max(MESSAGE_MAX_LENGTH, `Use até ${MESSAGE_MAX_LENGTH} caracteres.`),
  attachmentIds: z
    .array(z.uuid())
    .max(MESSAGE_ATTACHMENTS_MAX, `No máximo ${MESSAGE_ATTACHMENTS_MAX} anexos por mensagem.`)
    .transform((ids) => [...new Set(ids)]),
});
export type SendRequestMessageInput = z.input<typeof sendRequestMessageSchema>;

export const requestMessageTargetSchema = z.object({ messageId: z.uuid("Mensagem inválida.") });

// Entregas para aprovação

/** A equipe manda uma rodada: os arquivos (já no CDN, pasta "solicitacoes") e o recado em texto rico. */
export const sendDeliverySchema = z.object({
  requestId,
  /** HTML do editor; o servidor limpa (sanitizeRichText). */
  note: z.string().max(DELIVERY_NOTE_MAX_LENGTH, "O recado ficou longo demais."),
  mediaIds: z
    .array(z.uuid())
    .min(1, "Envie pelo menos um arquivo.")
    .max(DELIVERY_FILES_MAX, `No máximo ${DELIVERY_FILES_MAX} arquivos por rodada.`)
    .transform((ids) => [...new Set(ids)]),
});
export type SendDeliveryInput = z.input<typeof sendDeliverySchema>;

export const deliveryTargetSchema = z.object({ deliveryId: z.uuid("Entrega inválida.") });

/**
 * A resposta do cliente a um arquivo (rascunho até enviar as respostas):
 * aprovar, pedir alteração (dizendo o quê) ou desfazer (null).
 */
export const deliveryDecisionSchema = z
  .object({
    fileId: z.uuid("Arquivo inválido."),
    decision: z.enum(["approved", "changes"]).nullable(),
    comment: z
      .string()
      .trim()
      .max(DELIVERY_COMMENT_MAX_LENGTH, `Use até ${DELIVERY_COMMENT_MAX_LENGTH} caracteres.`)
      .default(""),
  })
  .refine((value) => value.decision !== "changes" || value.comment.length >= 3, {
    message: "Diga o que precisa mudar.",
    path: ["comment"],
  });
export type DeliveryDecisionInput = z.input<typeof deliveryDecisionSchema>;
