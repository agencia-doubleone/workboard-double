import { z } from "zod";

import { emailSchema } from "./auth";
import { personNameSchema } from "./users";

// Contatos do portal do cliente (cadastrados por admins na página do cliente).

const contactId = z.uuid("Acesso inválido.");

export const createPortalContactSchema = z.object({
  clientId: z.uuid("Cliente inválido."),
  name: personNameSchema,
  email: emailSchema,
  /** Manda o convite por e-mail (com o endereço do portal) ao criar. */
  sendInvite: z.boolean(),
  /** Aprova ou pede alterações nas entregas; sem isso, só acompanha. */
  canApprove: z.boolean(),
});
export type CreatePortalContactInput = z.input<typeof createPortalContactSchema>;

export const updatePortalContactSchema = z.object({
  contactId,
  name: personNameSchema,
  email: emailSchema,
  canApprove: z.boolean(),
});
export type UpdatePortalContactInput = z.input<typeof updatePortalContactSchema>;

export const portalContactTargetSchema = z.object({ contactId });

export const setPortalContactDisabledSchema = z.object({ contactId, disabled: z.boolean() });

// Perfil do próprio contato, no portal (/portal/perfil). O e-mail só um admin troca.

export const updatePortalProfileSchema = z.object({ name: personNameSchema });
export type UpdatePortalProfileInput = z.input<typeof updatePortalProfileSchema>;

export const updatePortalAvatarSchema = z.object({ mediaId: z.uuid("Foto inválida.") });
export type UpdatePortalAvatarInput = z.input<typeof updatePortalAvatarSchema>;
