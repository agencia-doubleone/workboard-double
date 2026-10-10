import {
  DEFAULT_PERIOD_PRESET,
  dayDiff,
  isReportTab,
  isValidDay,
  MAX_PERIOD_DAYS,
  PERIOD_PRESETS,
  presetPeriod,
  type Period,
  type PeriodPreset,
  type ReportTab,
} from "@/lib/reports";

// Filtros dos relatórios (na URL): aba, período (atalho ou de/até) e o cliente
// aberto na aba "Por cliente". Valores inválidos caem no padrão.

export type ReportParams = {
  tab: ReportTab;
  /** Atalho escolhido; null = período personalizado (de/até). */
  preset: PeriodPreset | null;
  period: Period;
  clientId?: string;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReportParams(raw: Record<string, string | string[] | undefined>, today: string): ReportParams {
  const tabValue = first(raw.aba);
  const tab: ReportTab = isReportTab(tabValue) ? tabValue : "geral";
  const from = first(raw.de);
  const to = first(raw.ate);
  const clientValue = first(raw.cliente);
  const clientId = tab === "clientes" && clientValue && UUID.test(clientValue) ? clientValue : undefined;

  if (isValidDay(from) && isValidDay(to) && from <= to && dayDiff(from, to) <= MAX_PERIOD_DAYS) {
    return { tab, preset: null, period: { from, to }, clientId };
  }
  const presetValue = first(raw.periodo);
  const preset = presetValue && presetValue in PERIOD_PRESETS ? (presetValue as PeriodPreset) : DEFAULT_PERIOD_PRESET;
  return { tab, preset, period: presetPeriod(preset, today), clientId };
}

export function reportHref(params: ReportParams) {
  const query = new URLSearchParams();
  if (params.tab !== "geral") query.set("aba", params.tab);
  if (params.preset) {
    if (params.preset !== DEFAULT_PERIOD_PRESET) query.set("periodo", params.preset);
  } else {
    query.set("de", params.period.from);
    query.set("ate", params.period.to);
  }
  if (params.clientId) query.set("cliente", params.clientId);
  const qs = query.toString();
  return qs ? `/relatorios?${qs}` : "/relatorios";
}
