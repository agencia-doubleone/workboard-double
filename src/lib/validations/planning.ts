import { z } from "zod";

import { isMonthKey } from "@/lib/calendar";
import { PLANNING_LIMITS, PLANNING_STATUS_KEYS, SOCIAL_NETWORK_KEYS } from "@/lib/planning";

const planningId = z.uuid("Planejamento inválido.");
const month = z.string().refine(isMonthKey, "Mês inválido.");
const status = z.enum(PLANNING_STATUS_KEYS, "Status inválido.");
const userId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

const planningFields = {
  networks: z
    .array(z.enum(SOCIAL_NETWORK_KEYS))
    .max(SOCIAL_NETWORK_KEYS.length)
    .transform((values) => [...new Set(values)]),
  postsPerMonth: z
    .number("Use um número.")
    .int("Use um número inteiro.")
    .min(1, "Pelo menos 1 post.")
    .max(200, "No máximo 200 posts.")
    .nullable(),
  overview: z.string().max(PLANNING_LIMITS.overview, "Texto grande demais."),
  memberIds: z
    .array(userId)
    .max(30, "No máximo 30 responsáveis.")
    .transform((ids) => [...new Set(ids)]),
};

export const createPlanningSchema = z.object({ clientId: z.uuid("Escolha o cliente."), ...planningFields });
export type CreatePlanningInput = z.input<typeof createPlanningSchema>;

export const updatePlanningSchema = z.object({ planningId, ...planningFields });
export type UpdatePlanningInput = z.input<typeof updatePlanningSchema>;

export const planningTargetSchema = z.object({ planningId });
export const planningMonthSchema = z.object({ planningId, month });

export const setMonthStatusSchema = z.object({ planningId, month, status });
export const setConceptSchema = z.object({
  planningId,
  month,
  concept: optionalText(PLANNING_LIMITS.concept, "Conceito grande demais."),
});

const sectionsSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1, "Dê um nome à seção.").max(PLANNING_LIMITS.sectionLabel, "Nome da seção grande demais."),
      text: z.string().trim().max(PLANNING_LIMITS.sectionText, "Seção grande demais."),
    }),
  )
  .max(PLANNING_LIMITS.sections, `No máximo ${PLANNING_LIMITS.sections} seções.`)
  .transform((sections) => sections.filter((section) => section.text));

const postFields = {
  date: z.iso.date("Use uma data completa.").nullable(),
  network: z.enum(SOCIAL_NETWORK_KEYS).nullable(),
  format: optionalText(PLANNING_LIMITS.format, "Formato grande demais."),
  topic: optionalText(PLANNING_LIMITS.topic, "Tema grande demais."),
  headline: z.string().trim().max(PLANNING_LIMITS.headline, `Use até ${PLANNING_LIMITS.headline} caracteres.`),
  copy: z.string().trim().max(PLANNING_LIMITS.copy, `Use até ${PLANNING_LIMITS.copy} caracteres.`),
  sections: sectionsSchema,
};

export const savePostSchema = z
  .object({ planningId, month, postId: z.uuid().optional(), status: status.optional(), ...postFields })
  .refine((post) => post.headline || post.copy || post.sections.length > 0, {
    path: ["headline"],
    message: "Escreva a headline, a copy ou alguma seção.",
  });
export type SavePostInput = z.input<typeof savePostSchema>;

export const importPostsSchema = z.object({
  planningId,
  month,
  document: z.string().max(PLANNING_LIMITS.document, "Documento grande demais."),
  concept: optionalText(PLANNING_LIMITS.concept, "Conceito grande demais."),
  mode: z.enum(["append", "replace"]),
  posts: z
    .array(z.object({ ...postFields, network: postFields.network.optional() }))
    .max(PLANNING_LIMITS.postsPerImport, `No máximo ${PLANNING_LIMITS.postsPerImport} posts por importação.`),
});
export type ImportPostsInput = z.input<typeof importPostsSchema>;

export const postTargetSchema = z.object({ postId: z.uuid("Post inválido.") });
export const setPostStatusSchema = z.object({ postId: z.uuid("Post inválido."), status });
export const setAllPostsStatusSchema = z.object({ planningId, month, status });
