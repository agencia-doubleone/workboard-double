import { z } from "zod";

import { WHITEBOARD_ACCESS_KEYS, WHITEBOARD_ELEMENT_TYPES, WHITEBOARD_LIMITS } from "@/lib/whiteboards";

const whiteboardId = z.uuid("Quadro inválido.");
const userId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const whiteboardFields = {
  title: z
    .string()
    .trim()
    .min(1, "Dê um nome ao quadro.")
    .max(WHITEBOARD_LIMITS.title, `No máximo ${WHITEBOARD_LIMITS.title} caracteres.`),
  access: z.enum(WHITEBOARD_ACCESS_KEYS, "Escolha quem acessa."),
  memberIds: z
    .array(userId)
    .max(WHITEBOARD_LIMITS.members, `No máximo ${WHITEBOARD_LIMITS.members} pessoas.`)
    .transform((ids) => [...new Set(ids)]),
  jobId: z.uuid("Trabalho inválido.").nullable(),
};

export const createWhiteboardSchema = z.object(whiteboardFields);
export type CreateWhiteboardInput = z.input<typeof createWhiteboardSchema>;

export const updateWhiteboardSchema = z.object({ whiteboardId, ...whiteboardFields });
export type UpdateWhiteboardInput = z.input<typeof updateWhiteboardSchema>;

export const whiteboardTargetSchema = z.object({ whiteboardId });

/**
 * Um elemento do Excalidraw: confere só o que o servidor usa (id, tipo, versão,
 * apagado) e o tamanho; o resto vai como veio.
 */
export const elementSchema = z
  .looseObject({
    id: z.string().min(1).max(64),
    type: z.enum(WHITEBOARD_ELEMENT_TYPES),
    version: z.int().min(1),
    versionNonce: z.int(),
    isDeleted: z.boolean(),
  })
  .refine((element) => JSON.stringify(element).length <= WHITEBOARD_LIMITS.elementBytes, "Elemento grande demais.");

/** Cada elemento é conferido à parte (elementSchema): um inválido não derruba o lote. */
export const saveElementsSchema = z.object({
  whiteboardId,
  elements: z.array(z.unknown()).min(1).max(WHITEBOARD_LIMITS.elementsPerSave),
});
export type SaveElementsInput = z.input<typeof saveElementsSchema>;

export const elementChangesSchema = z.object({ whiteboardId, cursor: z.iso.datetime({ offset: true }) });

export const savePreviewSchema = z.object({
  whiteboardId,
  /** Vazio: o quadro ficou em branco (sem miniatura). */
  dataUrl: z.union([
    z.literal(""),
    z
      .string()
      .max(WHITEBOARD_LIMITS.previewBytes)
      .regex(/^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/),
  ]),
});
