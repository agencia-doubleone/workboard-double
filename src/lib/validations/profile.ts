import { z } from "zod";

import { passwordSchema } from "./auth";
import { personNameSchema } from "./users";

export const updateProfileSchema = z.object({
  name: personNameSchema,
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
