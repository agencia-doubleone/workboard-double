"use client";

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useDayPicker, type MonthCaptionProps } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCalendarDate } from "@/lib/format";

type DatePickerProps = {
  id?: string;
  /**
   * "AAAA-MM-DD", ou "" sem data. Enquanto a digitação está incompleta, vem o
   * texto parcial ("12/03"): não é uma data, então a validação da página
   * (z.iso.date) acusa "data inválida" se a pessoa tentar salvar assim.
   */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Faixa de anos do seletor. Padrão: 100 anos para trás e 10 para a frente. */
  fromYear?: number;
  toYear?: number;
  /** Bloqueia os dias depois de hoje (ex.: aniversário). */
  disableFuture?: boolean;
  /** Bloqueia os dias antes de hoje (ex.: prazo). */
  disablePast?: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2000, index, 1));
  return name.charAt(0).toUpperCase() + name.slice(1);
});
const MONTH_ITEMS = Object.fromEntries(MONTHS.map((name, index) => [String(index), name]));

/** "AAAA-MM-DD" -> Date local, sem UTC (new Date("1992-03-14") cairia no dia 13 no Brasil). */
function parseValue(value: string) {
  if (!ISO_DATE.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // 31/02 vira 03/03 no Date: aí não é uma data de verdade.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function toValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Máscara dd/mm/aaaa: só dígitos, barras automáticas. Completa, vira "AAAA-MM-DD". */
function fromTyped(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 8) return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

/**
 * Campo de data: digita (dd/mm/aaaa) ou escolhe no calendário, com mês e ano
 * em selects. Use em todo formulário com data, em vez de <input type="date">.
 */
export function DatePicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
  placeholder = "dd/mm/aaaa",
  fromYear,
  toYear,
  disableFuture,
  disablePast,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const text = ISO_DATE.test(value) ? formatCalendarDate(value) : value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <InputGroup ref={groupRef} data-disabled={disabled || undefined}>
        <InputGroupInput
          id={id}
          value={text}
          onChange={(event) => onChange(fromTyped(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          aria-invalid={invalid}
          disabled={disabled}
          className="tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          {value && !disabled && (
            <InputGroupButton size="icon-xs" onClick={() => onChange("")} aria-label="Limpar data">
              <XIcon />
            </InputGroupButton>
          )}
          <PopoverTrigger
            disabled={disabled}
            render={<InputGroupButton size="icon-xs" aria-label="Abrir calendário" />}
          >
            <CalendarIcon />
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent anchor={groupRef} align="start" className="w-auto gap-0 p-0">
        <DatePickerCalendar
          value={value}
          fromYear={fromYear}
          toYear={toYear}
          disableFuture={disableFuture}
          disablePast={disablePast}
          onSelect={(date) => {
            if (date) onChange(toValue(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// Só monta com o popover aberto (no navegador): "hoje" é sempre o do cliente.
function DatePickerCalendar({
  value,
  fromYear,
  toYear,
  disableFuture,
  disablePast,
  onSelect,
}: Pick<DatePickerProps, "value" | "fromYear" | "toYear" | "disableFuture" | "disablePast"> & {
  onSelect: (date: Date | undefined) => void;
}) {
  const [today] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const startMonth = new Date(fromYear ?? today.getFullYear() - 100, 0);
  const endMonth = new Date(toYear ?? today.getFullYear() + 10, 11);
  const selected = parseValue(value);
  const disabledDays = [
    ...(disableFuture ? [{ after: today }] : []),
    ...(disablePast ? [{ before: today }] : []),
  ];
  const todayDisabled = today < startMonth || today > endMonth;

  return (
    <div className="flex flex-col">
      <Calendar
        mode="single"
        locale={ptBR}
        hideNavigation
        selected={selected}
        defaultMonth={clampMonth(selected ?? today, startMonth, endMonth)}
        startMonth={startMonth}
        endMonth={endMonth}
        disabled={disabledDays}
        onSelect={onSelect}
        components={{ MonthCaption: CalendarCaption }}
        className="p-3 [--cell-size:--spacing(9)]"
      />
      <div className="flex justify-end border-t px-3 py-2">
        <Button variant="ghost" size="sm" disabled={todayDisabled} onClick={() => onSelect(today)}>
          Hoje
        </Button>
      </div>
    </div>
  );
}

function clampMonth(date: Date, start: Date, end: Date) {
  const month = new Date(date.getFullYear(), date.getMonth());
  if (month < start) return start;
  if (month > end) return new Date(end.getFullYear(), end.getMonth());
  return month;
}

/**
 * Cabeçalho do calendário: mês e ano em selects, com setas para o mês vizinho.
 * As listas abrem abaixo do botão (alignItemWithTrigger={false}): alinhadas ao
 * item marcado, a de anos (longa) ia parar no topo da tela.
 */
function CalendarCaption({ calendarMonth }: MonthCaptionProps) {
  const { goToMonth, previousMonth, nextMonth, dayPickerProps } = useDayPicker();
  const current = calendarMonth.date;
  const start = dayPickerProps.startMonth ?? new Date(current.getFullYear() - 100, 0);
  const end = dayPickerProps.endMonth ?? new Date(current.getFullYear() + 10, 11);
  const years = Array.from(
    { length: end.getFullYear() - start.getFullYear() + 1 },
    (_, index) => String(end.getFullYear() - index),
  );
  const yearItems = Object.fromEntries(years.map((year) => [year, year]));

  function go(year: number, month: number) {
    goToMonth(clampMonth(new Date(year, month), start, end));
  }

  return (
    <div className="mb-2 flex items-center gap-1">
      <Select
        items={MONTH_ITEMS}
        value={String(current.getMonth())}
        onValueChange={(month) => month !== null && go(current.getFullYear(), Number(month))}
      >
        <SelectTrigger size="sm" aria-label="Mês" className="min-w-0 flex-1 px-2.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {MONTHS.map((name, index) => (
            <SelectItem
              key={name}
              value={String(index)}
              disabled={
                new Date(current.getFullYear(), index) < start ||
                new Date(current.getFullYear(), index) > end
              }
            >
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={yearItems}
        value={String(current.getFullYear())}
        onValueChange={(year) => year !== null && go(Number(year), current.getMonth())}
      >
        <SelectTrigger size="sm" aria-label="Ano" className="px-2.5 tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="max-h-64 min-w-24">
          {years.map((year) => (
            <SelectItem key={year} value={year} className="tabular-nums">
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Mês anterior"
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Próximo mês"
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
