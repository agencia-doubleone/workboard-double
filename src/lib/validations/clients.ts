import { z } from "zod";

import {
  AGE_MAX,
  AGE_MIN,
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NOTES_MAX_LENGTH,
  GENDER_VALUES,
  SOCIAL_CLASSES,
} from "@/lib/clients";

/** Em branco = null. Sem protocolo, assume https ("cliente.com.br" vira "https://cliente.com.br"). */
const optionalUrl = z.preprocess(
  (value) => {
    if (value === undefined) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  },
  // hostname: o Chrome aceita espaço no domínio ("https://a b.com" vira a%20b.com);
  // exigir um domínio de verdade deixa navegador e servidor com a mesma regra.
  z.url({ protocol: /^https?$/, hostname: z.regexes.domain, message: "Informe um endereço válido." }).max(500).nullable(),
);

const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) => (value === undefined || (typeof value === "string" && value.trim() === "") ? null : value),
    z.string().trim().max(max, message).nullable(),
  );

const clientFields = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente.")
    .max(CLIENT_NAME_MAX_LENGTH, `O nome pode ter no máximo ${CLIENT_NAME_MAX_LENGTH} caracteres.`),
  website: optionalUrl,
  instagram: optionalUrl,
  facebook: optionalUrl,
  linkedin: optionalUrl,
  youtube: optionalUrl,
  ageMin: z.number().int().min(AGE_MIN).max(AGE_MAX),
  ageMax: z.number().int().min(AGE_MIN).max(AGE_MAX),
  genders: z.array(z.enum(GENDER_VALUES)).transform((values) => [...new Set(values)]),
  socialClasses: z.array(z.enum(SOCIAL_CLASSES)).transform((values) => [...new Set(values)]),
  /** HTML do editor; o servidor limpa antes de salvar (src/server/rich-text.ts). */
  notes: z.string().max(CLIENT_NOTES_MAX_LENGTH, "O texto ficou longo demais."),
  /**
   * Logo já enviado ao CDN (pasta "clientes"). undefined = não mexe,
   * null = remove, id = troca.
   */
  logoMediaId: z.uuid("Logo inválido.").nullable().optional(),
});

const agesInOrder = (data: { ageMin: number; ageMax: number }) => data.ageMin <= data.ageMax;
const agesInOrderError = { path: ["ageMax"], message: "A idade final precisa ser maior que a inicial." };

export const clientSchema = clientFields.refine(agesInOrder, agesInOrderError);
export type ClientInput = z.input<typeof clientSchema>;

export const updateClientSchema = clientFields
  .extend({ clientId: z.uuid("Cliente inválido.") })
  .refine(agesInOrder, agesInOrderError);
export type UpdateClientInput = z.input<typeof updateClientSchema>;

export const clientTargetSchema = z.object({ clientId: z.uuid("Cliente inválido.") });

// Cofre de senhas

const credentialFields = {
  service: z.string().trim().min(1, "Informe o serviço.").max(80, "Use até 80 caracteres."),
  url: optionalUrl,
  username: optionalText(200, "Use até 200 caracteres."),
  notes: optionalText(2000, "Use até 2000 caracteres."),
};

export const createCredentialSchema = z.object({
  clientId: z.uuid("Cliente inválido."),
  ...credentialFields,
  password: z.string().min(1, "Informe a senha.").max(500, "Use até 500 caracteres."),
});
export type CreateCredentialInput = z.input<typeof createCredentialSchema>;

export const updateCredentialSchema = z.object({
  credentialId: z.uuid("Acesso inválido."),
  ...credentialFields,
  /** Em branco = mantém a senha atual. */
  password: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(500, "Use até 500 caracteres.").optional(),
  ),
});
export type UpdateCredentialInput = z.input<typeof updateCredentialSchema>;

export const credentialTargetSchema = z.object({ credentialId: z.uuid("Acesso inválido.") });

export const revealCredentialSchema = credentialTargetSchema.extend({
  /** Só muda o registro na auditoria: ver na tela ou copiar. */
  purpose: z.enum(["view", "copy"]),
});
