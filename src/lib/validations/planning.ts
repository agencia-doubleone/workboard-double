import { z } from "zod";

import { isMonthKey } from "@/lib/calendar";
import {
  ART_ROLES,
  keepKindParts,
  parseHashtags,
  PLANNING_LIMITS,
  PLANNING_REVIEW_COMMENT_MAX,
  PLANNING_SEND_NOTE_MAX,
  PLANNING_STATUS_KEYS,
  POST_ART_RULES,
  POST_KIND_KEYS,
  SOCIAL_NETWORK_KEYS,
} from "@/lib/planning";

const planningId = z.uuid("Planejamento inválido.");
const month = z.string().refine(isMonthKey, "Mês inválido.");
const status = z.enum(PLANNING_STATUS_KEYS, "Status inválido.");
const userId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** Texto opcional: vazio ou null viram null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
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
  approvesBrief: z.boolean(),
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

const tooLong = (max: number) => `Use até ${max.toLocaleString("pt-BR")} caracteres.`;

// Os campos do JSON padrão (src/lib/planning-json.ts), já com os nomes do banco.
const postFields = {
  date: z.iso.date("Use uma data completa.").nullable(),
  network: z.enum(SOCIAL_NETWORK_KEYS).nullable(),
  kind: z.enum(POST_KIND_KEYS, "Tipo inválido."),
  headline: z.string().trim().max(PLANNING_LIMITS.headline, tooLong(PLANNING_LIMITS.headline)),
  supportText: optionalText(PLANNING_LIMITS.supportText, tooLong(PLANNING_LIMITS.supportText)),
  copy: z.string().trim().max(PLANNING_LIMITS.copy, tooLong(PLANNING_LIMITS.copy)),
  cta: optionalText(PLANNING_LIMITS.cta, tooLong(PLANNING_LIMITS.cta)),
  hashtags: z
    .array(z.string().max(PLANNING_LIMITS.hashtag, "Hashtag longa demais."))
    .max(PLANNING_LIMITS.hashtags, `No máximo ${PLANNING_LIMITS.hashtags} hashtags.`)
    .transform((tags) => parseHashtags(tags)),
  slides: z
    .array(
      z.object({
        headline: optionalText(PLANNING_LIMITS.headline, tooLong(PLANNING_LIMITS.headline)),
        supportText: optionalText(PLANNING_LIMITS.supportText, tooLong(PLANNING_LIMITS.supportText)),
      }),
    )
    .max(PLANNING_LIMITS.slides, `No máximo ${PLANNING_LIMITS.slides} slides.`)
    .transform((slides) => slides.filter((slide) => slide.headline || slide.supportText)),
  scenes: z
    .array(z.object({ text: z.string().trim().max(PLANNING_LIMITS.sceneText, tooLong(PLANNING_LIMITS.sceneText)) }))
    .max(PLANNING_LIMITS.scenes, `No máximo ${PLANNING_LIMITS.scenes} cenas.`)
    .transform((scenes) => scenes.filter((scene) => scene.text)),
};

const artList = z
  .array(z.object({ mediaId: z.uuid("Arte inválida."), role: z.enum(ART_ROLES) }))
  .max(Math.max(...Object.values(POST_ART_RULES).map((rule) => rule.max)) + 1, "Artes demais.");

export const savePostSchema = z
  .object({
    planningId,
    month,
    postId: z.uuid().optional(),
    status: status.optional(),
    ...postFields,
    /** Observações dos posts do formato antigo (o editor só mostra quando o post tem). */
    notes: optionalText(PLANNING_LIMITS.notes, tooLong(PLANNING_LIMITS.notes)).optional(),
    /** A lista inteira de artes, na ordem (ausente: não mexe). */
    art: artList.optional(),
    /** A edição mexe num post aprovado: "drop" tira a aprovação, "keep" (só admins) mantém. */
    approval: z.enum(["keep", "drop"]).optional(),
  })
  .transform(keepKindParts)
  .refine((post) => post.headline || post.copy || post.supportText || post.slides.length > 0 || post.scenes.length > 0, {
    path: ["headline"],
    message: "Escreva a headline, a copy ou o conteúdo da arte.",
  });
export type SavePostInput = z.input<typeof savePostSchema>;

export const importPostsSchema = z.object({
  planningId,
  month,
  mode: z.enum(["append", "replace"]),
  posts: z
    .array(z.object({ ...postFields, network: postFields.network.optional() }).transform(keepKindParts))
    .min(1, "Escolha pelo menos um post.")
    .max(PLANNING_LIMITS.postsPerImport, `No máximo ${PLANNING_LIMITS.postsPerImport} posts por importação.`),
});
export type ImportPostsInput = z.input<typeof importPostsSchema>;

export const postTargetSchema = z.object({ postId: z.uuid("Post inválido.") });
/** `stage`: a etapa escolhida no seletor com etapa ("Pauta ·"/"Arte ·"); mudar a etapa ajusta a pauta. */
export const setPostStatusSchema = z.object({ postId: z.uuid("Post inválido."), status, stage: z.enum(["pauta", "arte"]).optional() });
export const setAllPostsStatusSchema = z.object({ planningId, month, status });
export const mediaTargetSchema = z.object({ mediaId: z.uuid("Arquivo inválido.") });

const stage = z.enum(["pauta", "arte"], "Etapa inválida.");
const postIds = z
  .array(z.uuid())
  .min(1, "Escolha pelo menos um post.")
  .max(PLANNING_LIMITS.postsPerImport * 2);
const reviewComment = optionalText(PLANNING_REVIEW_COMMENT_MAX, tooLong(PLANNING_REVIEW_COMMENT_MAX));
const needsComment = { path: ["comment"], message: "Diga o que mudar." };

export const sendForApprovalSchema = z.object({
  planningId,
  month,
  stage,
  postIds,
  note: z.string().max(PLANNING_SEND_NOTE_MAX, "Recado grande demais."),
});
export type SendForApprovalInput = z.input<typeof sendForApprovalSchema>;

export const sendTargetSchema = z.object({ planningId, month, sendId: z.uuid("Envio inválido.") });

/** A equipe registra a resposta do cliente (aprovar, ou pedir alteração dizendo o quê). */
export const registerDecisionSchema = z
  .object({ planningId, postIds, stage, decision: z.enum(["approved", "changes"]), comment: reviewComment })
  .refine((input) => input.decision !== "changes" || input.comment, needsComment);
export type RegisterDecisionInput = z.input<typeof registerDecisionSchema>;

/** O contato do portal responde um post do envio (null desfaz o rascunho). */
export const draftDecisionSchema = z
  .object({ sendPostId: z.uuid("Post inválido."), decision: z.enum(["approved", "changes"]).nullable(), comment: reviewComment })
  .refine((input) => input.decision !== "changes" || input.comment, needsComment);
export type DraftDecisionInput = z.input<typeof draftDecisionSchema>;

export const submitAnswersSchema = z.object({
  month,
  note: optionalText(PLANNING_REVIEW_COMMENT_MAX, tooLong(PLANNING_REVIEW_COMMENT_MAX)),
  approveRest: z.boolean(),
});
export type SubmitAnswersInput = z.input<typeof submitAnswersSchema>;

/** Só as artes do post (o botão "Adicionar arte" do card), com a mesma confirmação do D5. */
export const savePostArtSchema = z.object({
  postId: z.uuid("Post inválido."),
  art: artList,
  approval: z.enum(["keep", "drop"]).optional(),
});
export type SavePostArtInput = z.input<typeof savePostArtSchema>;
