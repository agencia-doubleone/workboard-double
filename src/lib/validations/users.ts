import { z } from "zod";

import { ROLES } from "@/lib/users";
import { emailSchema, passwordSchema } from "./auth";

const userIdSchema = z.string().min(1, "Usuário inválido.");

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Informe o nome.")
  .max(100, "O nome pode ter no máximo 100 caracteres.");

const userFieldsSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  role: z.enum(ROLES, "Escolha um papel."),
});

export const createUserSchema = userFieldsSchema.extend({
  // Em branco = o servidor gera uma senha forte e devolve uma única vez.
  password: z.preprocess((value) => (value === "" ? undefined : value), passwordSchema.optional()),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = userFieldsSchema.extend({
  userId: userIdSchema,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserPasswordSchema = z.object({
  userId: userIdSchema,
  password: passwordSchema,
});
export type SetUserPasswordInput = z.infer<typeof setUserPasswordSchema>;

export const setUserActiveSchema = z.object({
  userId: userIdSchema,
  active: z.boolean(),
  reason: z
    .string()
    .trim()
    .max(300, "O motivo pode ter no máximo 300 caracteres.")
    .optional(),
});
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export const userTargetSchema = z.object({ userId: userIdSchema });
