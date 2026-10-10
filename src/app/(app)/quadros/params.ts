import { z } from "zod";

import { WHITEBOARD_SCOPES, type WhiteboardScope } from "@/lib/whiteboards";

// Filtros da lista de quadros (na URL). Valores inválidos são ignorados.

export const WHITEBOARD_SCOPE_LABELS: Record<WhiteboardScope, string> = {
  todos: "Todos os quadros",
  meus: "Criados por mim",
  pessoais: "Pessoais",
  trabalhos: "Vinculados a trabalhos",
};

export const WHITEBOARDS_PAGE_SIZE = 24;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const schema = z.object({
  busca: z.string().trim().max(100).optional().catch(undefined),
  escopo: z.enum(WHITEBOARD_SCOPES).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type WhiteboardsParams = z.infer<typeof schema>;

export function parseWhiteboardsParams(raw: Record<string, string | string[] | undefined>): WhiteboardsParams {
  return schema.parse({
    busca: first(raw.busca) || undefined,
    escopo: first(raw.escopo) === "todos" ? undefined : first(raw.escopo),
    pagina: first(raw.pagina) ?? 1,
  });
}

export function whiteboardsHref(params: Partial<WhiteboardsParams>) {
  const query = new URLSearchParams();
  if (params.busca) query.set("busca", params.busca);
  if (params.escopo && params.escopo !== "todos") query.set("escopo", params.escopo);
  if (params.pagina && params.pagina > 1) query.set("pagina", String(params.pagina));
  const qs = query.toString();
  return qs ? `/quadros?${qs}` : "/quadros";
}
