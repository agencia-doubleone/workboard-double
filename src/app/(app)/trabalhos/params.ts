import { z } from "zod";

import {
  DEFAULT_JOB_PAGE_SIZE,
  DEFAULT_JOB_SITUATION,
  JOB_PAGE_SIZES,
  JOB_SITUATIONS,
  type JobSituation,
} from "@/lib/jobs";

// Filtros da lista de trabalhos na URL (?busca=&situacao=&status=&cliente=&funcionario=&porPagina=&pagina=),
// lidos pela página e montados pela barra de filtros e pela paginação.

/** "eu" no filtro de funcionário: os trabalhos de quem está vendo. */
export const MY_JOBS = "eu";

export type JobListParams = {
  busca?: string;
  situacao: JobSituation;
  status?: string;
  cliente?: string;
  funcionario?: string;
  porPagina: number;
  pagina: number;
};

const SITUATION_VALUES = Object.keys(JOB_SITUATIONS) as [JobSituation, ...JobSituation[]];

// Parâmetros inválidos são ignorados, nunca quebram a página.
const searchSchema = z.object({
  busca: z.string().trim().max(100).optional().catch(undefined),
  situacao: z.enum(SITUATION_VALUES).catch(DEFAULT_JOB_SITUATION),
  status: z.uuid().optional().catch(undefined),
  cliente: z.uuid().optional().catch(undefined),
  funcionario: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional()
    .catch(undefined),
  porPagina: z.coerce
    .number()
    .refine((value) => (JOB_PAGE_SIZES as readonly number[]).includes(value))
    .catch(DEFAULT_JOB_PAGE_SIZE),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseJobListParams(raw: Record<string, string | string[] | undefined>): JobListParams {
  const parsed = searchSchema.parse({
    busca: first(raw.busca),
    situacao: first(raw.situacao) ?? DEFAULT_JOB_SITUATION,
    status: first(raw.status),
    cliente: first(raw.cliente),
    funcionario: first(raw.funcionario),
    porPagina: first(raw.porPagina) ?? DEFAULT_JOB_PAGE_SIZE,
    pagina: first(raw.pagina) ?? 1,
  });
  return { ...parsed, busca: parsed.busca || undefined };
}

/** Endereço da lista com os filtros; valores padrão ficam fora da URL. */
export function jobListHref(params: JobListParams) {
  const query = new URLSearchParams();
  if (params.busca) query.set("busca", params.busca);
  if (params.situacao !== DEFAULT_JOB_SITUATION) query.set("situacao", params.situacao);
  if (params.status) query.set("status", params.status);
  if (params.cliente) query.set("cliente", params.cliente);
  if (params.funcionario) query.set("funcionario", params.funcionario);
  if (params.porPagina !== DEFAULT_JOB_PAGE_SIZE) query.set("porPagina", String(params.porPagina));
  if (params.pagina > 1) query.set("pagina", String(params.pagina));
  const qs = query.toString();
  return qs ? `/trabalhos?${qs}` : "/trabalhos";
}
