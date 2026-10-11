import { z } from "zod";

import { MESSAGE_ATTACHMENTS_MAX, MESSAGE_MAX_LENGTH } from "@/lib/jobs";

const conversationId = z.uuid("Conversa inválida.");

export const startConversationSchema = z.object({
  userId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Pessoa inválida."),
});

export const sendChatMessageSchema = z
  .object({
    conversationId,
    body: z.string().trim().max(MESSAGE_MAX_LENGTH, `Use até ${MESSAGE_MAX_LENGTH} caracteres.`),
    attachmentIds: z
      .array(z.uuid())
      .max(MESSAGE_ATTACHMENTS_MAX, `No máximo ${MESSAGE_ATTACHMENTS_MAX} anexos por mensagem.`)
      .transform((ids) => [...new Set(ids)]),
    /** Algum anexo é imagem colada com Ctrl+V (conquista "Print ou Não Aconteceu"). */
    pastedImage: z.boolean().optional(),
  })
  .refine((data) => data.body.length > 0 || data.attachmentIds.length > 0, {
    path: ["body"],
    message: "Escreva uma mensagem ou anexe um arquivo.",
  });
export type SendChatMessageInput = z.input<typeof sendChatMessageSchema>;

export const conversationTargetSchema = z.object({ conversationId });

export const olderChatMessagesSchema = z.object({ conversationId, before: z.iso.datetime() });

export const chatMessageTargetSchema = z.object({ messageId: z.uuid("Mensagem inválida.") });
