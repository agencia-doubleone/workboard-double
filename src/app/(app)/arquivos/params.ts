import { z } from "zod";

import { MEDIA_FOLDERS } from "@/lib/media";

// Filtros da página de arquivos (na URL). Valores inválidos são ignorados.

export const FILE_SITUATIONS = {
  "sem-uso": "Sem uso",
  "sem-registro": "Sem registro",
  sumidos: "Não estão no servidor",
  "em-uso": "Em uso",
  recentes: "Recentes sem uso",
} as const;
export type FileSituation = keyof typeof FILE_SITUATIONS;

export const FILES_PAGE_SIZE = 50;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const schema = z.object({
  busca: z.string().trim().max(100).optional().catch(undefined),
  pasta: z.enum(MEDIA_FOLDERS).optional().catch(undefined),
  situacao: z
    .enum(Object.keys(FILE_SITUATIONS) as [FileSituation, ...FileSituation[]])
    .optional()
    .catch(undefined),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type FilesParams = z.infer<typeof schema>;

export function parseFilesParams(raw: Record<string, string | string[] | undefined>): FilesParams {
  return schema.parse({
    busca: first(raw.busca) || undefined,
    pasta: first(raw.pasta),
    situacao: first(raw.situacao),
    pagina: first(raw.pagina) ?? 1,
  });
}

export function filesHref(params: Partial<FilesParams>) {
  const query = new URLSearchParams();
  if (params.busca) query.set("busca", params.busca);
  if (params.pasta) query.set("pasta", params.pasta);
  if (params.situacao) query.set("situacao", params.situacao);
  if (params.pagina && params.pagina > 1) query.set("pagina", String(params.pagina));
  const qs = query.toString();
  return qs ? `/arquivos?${qs}` : "/arquivos";
}
