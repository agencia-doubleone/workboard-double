import { z } from "zod";

import {
  formatBytes,
  getFileExtension,
  getMediaType,
  MEDIA_FOLDERS,
  MEDIA_KINDS,
  MEDIA_NAME_MAX_LENGTH,
} from "@/lib/media";

/** Pedido de assinatura: validado no navegador (antes de enviar) e no servidor. */
export const signMediaSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "O arquivo precisa ter um nome.")
      .max(MEDIA_NAME_MAX_LENGTH, `O nome do arquivo pode ter no máximo ${MEDIA_NAME_MAX_LENGTH} caracteres.`),
    size: z.number().int().positive("O arquivo está vazio."),
    folder: z.enum(MEDIA_FOLDERS, "Pasta inválida.").default("geral"),
  })
  .superRefine(({ name, size }, ctx) => {
    const type = getMediaType(name);
    if (!type) {
      const extension = getFileExtension(name);
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: extension
          ? `Arquivos .${extension} não são aceitos.`
          : "O arquivo precisa ter uma extensão (ex.: .pdf).",
      });
      return;
    }
    const kind = MEDIA_KINDS[type.kind];
    if (size > kind.maxSize) {
      ctx.addIssue({
        code: "custom",
        path: ["size"],
        message: `Arquivo grande demais: o limite para ${kind.label.toLowerCase()} é ${formatBytes(kind.maxSize)}.`,
      });
    }
  });
export type SignMediaInput = z.input<typeof signMediaSchema>;

export const completeMediaSchema = z.object({
  receipt: z.string().min(1, "Recibo de envio ausente.").max(4096),
});
