"use client";

import { Loader2Icon, PrinterIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dayDiff, isValidDay, MAX_PERIOD_DAYS, PERIOD_PRESETS, type PeriodPreset } from "@/lib/reports";
import { reportHref, type ReportParams } from "./params";

const CUSTOM = "personalizado";

/** Período dos relatórios (atalhos ou de/até) e o botão de imprimir/salvar PDF. */
export function ReportToolbar({ params }: { params: ReportParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [custom, setCustom] = useState(params.preset === null);
  const [from, setFrom] = useState(params.period.from);
  const [to, setTo] = useState(params.period.to);

  function navigate(next: Partial<ReportParams>) {
    startTransition(() => router.replace(reportHref({ ...params, ...next }), { scroll: false }));
  }

  const rangeError = !isValidDay(from) || !isValidDay(to)
    ? "Use datas completas (dd/mm/aaaa)."
    : from > to
      ? "A data inicial vem depois da final."
      : dayDiff(from, to) > MAX_PERIOD_DAYS
        ? "Escolha um período de até 3 anos."
        : null;
  // Papel é branco: no tema escuro, imprime com as cores do tema claro (e volta depois).
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    function before() {
      wasDark = root.classList.contains("dark");
      root.classList.remove("dark");
    }
    function after() {
      if (wasDark) root.classList.add("dark");
    }
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const changed = from !== params.period.from || to !== params.period.to || params.preset !== null;
  const items = { ...PERIOD_PRESETS, [CUSTOM]: "Personalizado" };

  return (
    <div className="flex flex-col gap-2 print:hidden sm:flex-row sm:flex-wrap sm:items-start">
      <Select
        items={items}
        value={custom ? CUSTOM : (params.preset ?? CUSTOM)}
        onValueChange={(value) => {
          if (value === CUSTOM) {
            setCustom(true);
            return;
          }
          if (value && value in PERIOD_PRESETS) {
            setCustom(false);
            navigate({ preset: value as PeriodPreset });
          }
        }}
      >
        <SelectTrigger className="sm:w-48" aria-label="Período">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {custom && (
        <form
          className="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (rangeError) return;
            navigate({ preset: null, period: { from, to } });
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <DatePicker value={from} onChange={setFrom} invalid={Boolean(rangeError)} />
            </div>
            <span className="text-sm text-muted-foreground">até</span>
            <div className="w-40">
              <DatePicker value={to} onChange={setTo} invalid={Boolean(rangeError)} />
            </div>
            <Button type="submit" variant="soft" disabled={Boolean(rangeError) || !changed}>
              Aplicar
            </Button>
          </div>
          {rangeError && <p className="text-xs text-destructive-ink">{rangeError}</p>}
        </form>
      )}

      {isPending && <Loader2Icon className="mt-3 size-4 animate-spin text-muted-foreground" aria-label="Carregando" />}

      <Button variant="outline" className="sm:ml-auto" onClick={() => window.print()}>
        <PrinterIcon data-icon="inline-start" />
        Imprimir ou salvar PDF
      </Button>
    </div>
  );
}
