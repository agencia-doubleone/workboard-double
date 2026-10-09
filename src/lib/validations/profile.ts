import { z } from "zod";

import { passwordSchema } from "./auth";
import { personNameSchema } from "./users";

/** Hoje em "AAAA-MM-DD" (UTC): basta para barrar datas no futuro. */
const today = () => new Date().toISOString().slice(0, 10);

/** Data do <input type="date"> ("AAAA-MM-DD"); em branco = sem aniversário. */
export const birthdaySchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.iso
    .date("Informe uma data válida.")
    .refine((value) => value >= "1900-01-01" && value <= today(), "Informe uma data entre 1900 e hoje.")
    .nullable(),
);

export const updateProfileSchema = z.object({
  name: personNameSchema,
  birthday: birthdaySchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: passwordSchema,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual.",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** A foto já enviada ao CDN por uploadMedia (pasta "usuarios"). */
export const updateAvatarSchema = z.object({
  mediaId: z.uuid("Foto inválida."),
});
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;
