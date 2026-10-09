import { z } from "zod";

import {
  JOB_ASSIGNEES_MAX,
  JOB_BRIEFING_MAX_LENGTH,
  JOB_NAME_MAX_LENGTH,
  MESSAGE_ATTACHMENTS_MAX,
  MESSAGE_MAX_LENGTH,
  STATUS_NAME_MAX_LENGTH,
} from "@/lib/jobs";

const jobId = z.uuid("Trabalho inválido.");

/** Data do DatePicker ("AAAA-MM-DD"); em branco = sem entrega. */
const dueDate = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.iso
    .date("Informe uma data válida.")
    .refine((value) => value >= "2000-01-01" && value <= "2100-12-31", "Informe uma data entre 2000 e 2100.")
    .nullable(),
);

const jobFields = {
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do trabalho.")
    .max(JOB_NAME_MAX_LENGTH, `Use até ${JOB_NAME_MAX_LENGTH} caracteres.`),
  clientId: z.uuid("Escolha o cliente."),
  assigneeIds: z
    .array(z.string().min(1))
    .max(JOB_ASSIGNEES_MAX, `No máximo ${JOB_ASSIGNEES_MAX} pessoas.`)
    .transform((ids) => [...new Set(ids)]),
  dueDate,
  statusId: z.uuid("Escolha o status."),
  active: z.boolean(),
  /** HTML do editor; o servidor limpa antes de salvar (sanitizeRichText). */
  briefing: z.string().max(JOB_BRIEFING_MAX_LENGTH, "O briefing ficou longo demais."),
};

export const createJobSchema = z.object(jobFields);
export type CreateJobInput = z.input<typeof createJobSchema>;

export const updateJobSchema = z.object({ ...jobFields, jobId });
export type UpdateJobInput = z.input<typeof updateJobSchema>;

export const setJobStatusSchema = z.object({ jobId, statusId: z.uuid("Status inválido.") });
export const setJobActiveSchema = z.object({ jobId, active: z.boolean() });
export const jobTargetSchema = z.object({ jobId });

export const sendMessageSchema = z
  .object({
    jobId,
    body: z.string().trim().max(MESSAGE_MAX_LENGTH, `Use até ${MESSAGE_MAX_LENGTH} caracteres.`),
    attachmentIds: z
      .array(z.uuid())
      .max(MESSAGE_ATTACHMENTS_MAX, `No máximo ${MESSAGE_ATTACHMENTS_MAX} anexos por mensagem.`)
      .transform((ids) => [...new Set(ids)]),
  })
  .refine((data) => data.body.length > 0 || data.attachmentIds.length > 0, {
    path: ["body"],
    message: "Escreva uma mensagem ou anexe um arquivo.",
  });
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const messageTargetSchema = z.object({ messageId: z.uuid("Mensagem inválida.") });

// Status (admins)

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use uma cor no formato #rrggbb.");

const statusFields = {
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do status.")
    .max(STATUS_NAME_MAX_LENGTH, `Use até ${STATUS_NAME_MAX_LENGTH} caracteres.`),
  textColor: hexColor,
  backgroundColor: hexColor,
  isFinal: z.boolean(),
};

export const createJobStatusSchema = z.object(statusFields);
export type CreateJobStatusInput = z.input<typeof createJobStatusSchema>;

export const updateJobStatusSchema = z.object({ ...statusFields, statusId: z.uuid("Status inválido.") });
export type UpdateJobStatusInput = z.input<typeof updateJobStatusSchema>;

export const jobStatusTargetSchema = z.object({ statusId: z.uuid("Status inválido.") });

export const moveJobStatusSchema = z.object({
  statusId: z.uuid("Status inválido."),
  direction: z.enum(["up", "down"]),
});
