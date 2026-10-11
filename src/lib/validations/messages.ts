import { z } from "zod";

import { MESSAGE_REACTIONS } from "@/lib/messages";

// Reações, fixadas e favoritas: os mesmos formatos no chat e nos trabalhos.

const messageId = z.uuid("Mensagem inválida.");

export const messageReactionSchema = z.object({ messageId, emoji: z.enum(MESSAGE_REACTIONS) });

export const messagePinSchema = z.object({ messageId, pinned: z.boolean() });

export const messageFavoriteSchema = z.object({ messageId });
