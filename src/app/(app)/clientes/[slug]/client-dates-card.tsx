import { CalendarHeartIcon, PartyPopperIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayMonth, formatUntil, nextOccurrence } from "@/lib/calendar";
import { foundingOccasion } from "@/lib/clients";
import { formatCalendarDate } from "@/lib/format";
import { todayInSaoPaulo } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import type { ClientDateItem } from "@/server/clients";

type DateEntry = { key: string; label: string; detail: string; next: string | null; founding: boolean };

/** Fundação e datas importantes, da mais próxima para a mais distante (as que já passaram por último). */
export function ClientDatesCard({
  foundedOn,
  dates,
  isAdmin,
}: {
  foundedOn: string | null;
  dates: ClientDateItem[];
  isAdmin: boolean;
}) {
  const today = todayInSaoPaulo();
  const entries: DateEntry[] = [
    ...(foundedOn
      ? [
          {
            key: "fundacao",
            label: "Aniversário da empresa",
            detail: `${formatDayMonth(foundedOn)} · fundada em ${foundedOn.slice(0, 4)}`,
            next: nextOccurrence(foundedOn, true, today),
            founding: true,
          },
        ]
      : []),
    ...dates.map((item) => ({
      key: item.id,
      label: item.label,
      detail: item.yearly ? `${formatDayMonth(item.date)} · todo ano` : formatCalendarDate(item.date),
      next: nextOccurrence(item.date, item.yearly, today),
      founding: false,
    })),
  ].sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datas</CardTitle>
        <CardDescription>Aparecem no calendário da equipe.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma data cadastrada.{isAdmin && " Use “Editar” para adicionar o aniversário da empresa e outras datas."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => {
              const Icon = entry.founding ? PartyPopperIcon : CalendarHeartIcon;
              const age = entry.founding && entry.next ? foundingOccasion(foundedOn!, entry.next).age : null;
              return (
                <li key={entry.key} className={cn("flex items-start gap-3 text-sm", !entry.next && "opacity-60")}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{entry.label}</span>
                    <span className="text-xs text-muted-foreground">{entry.detail}</span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-right text-xs text-muted-foreground",
                      entry.next === today && "font-medium text-primary-ink",
                    )}
                  >
                    {entry.next ? formatUntil(entry.next, today) : "Já passou"}
                    {age && <span className="block">{age}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
