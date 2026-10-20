import { CalendarClockIcon, ListChecksIcon, PencilLineIcon, SendIcon } from "lucide-react";

import { deliveryAnswerSummary } from "@/lib/client-requests";
import { RequestStatusBadge } from "./request-status-badge";
import type { RequestTimelineItemView } from "./types";

/**
 * O andamento da solicitação, do mais recente para o mais antigo: as trocas de
 * status, a previsão de entrega (informada, trocada ou tirada), as edições do
 * assunto e do briefing e as rodadas para aprovação (enviadas e respondidas),
 * com quem fez e quando. Igual na equipe e no portal.
 */
export function RequestTimeline({
  items,
  teamLabel,
}: {
  items: RequestTimelineItemView[];
  /** Como aparece quem é da agência: o nome (equipe) ou "Double One" ao lado do nome (portal). */
  teamLabel?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nada ainda.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={`${item.kind}-${item.id}`} className="relative flex gap-3 pl-4">
          <span
            aria-hidden="true"
            className={
              index === 0
                ? "absolute top-1.5 left-0 size-2 rounded-full bg-primary"
                : "absolute top-1.5 left-0 size-2 rounded-full bg-border"
            }
          />
          <div className="flex min-w-0 flex-col gap-1">
            <TimelineEntry item={item} />
            <span className="text-xs text-muted-foreground">
              {item.at}
              {item.by && (
                <>
                  {" · "}
                  {item.by}
                  {item.side === "team" && teamLabel ? ` (${teamLabel})` : ""}
                </>
              )}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TimelineEntry({ item }: { item: RequestTimelineItemView }) {
  switch (item.kind) {
    case "status":
      return <RequestStatusBadge status={item.status} className="w-fit" />;
    case "expected_on":
      return (
        <EntryText icon={<CalendarClockIcon />}>
          {item.to && !item.from && (
            <>
              Previsão de entrega: <strong className="font-medium">{item.to}</strong>
            </>
          )}
          {item.to && item.from && (
            <>
              Previsão de entrega alterada para <strong className="font-medium">{item.to}</strong>{" "}
              <span className="text-muted-foreground">(era {item.from})</span>
            </>
          )}
          {!item.to && (
            <>
              Previsão de entrega retirada
              {item.from && <span className="text-muted-foreground"> (era {item.from})</span>}
            </>
          )}
        </EntryText>
      );
    case "edited":
      return <EntryText icon={<PencilLineIcon />}>{editedText(item.fields)}</EntryText>;
    case "delivery_sent":
      return (
        <EntryText icon={<SendIcon />}>
          Rodada {item.round} enviada para aprovação{" "}
          <span className="text-muted-foreground">({item.files === 1 ? "1 arquivo" : `${item.files} arquivos`})</span>
        </EntryText>
      );
    case "delivery_answered":
      return (
        <EntryText icon={<ListChecksIcon />}>
          Rodada {item.round} respondida:{" "}
          <strong className="font-medium">{deliveryAnswerSummary(item.approved, item.changes)}</strong>
        </EntryText>
      );
  }
}

/** "Assunto editado", "Assunto e briefing editados". */
function editedText(fields: string[]) {
  const list = fields.length > 1 ? `${fields.slice(0, -1).join(", ")} e ${fields.at(-1)}` : (fields[0] ?? "solicitação");
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${fields.length > 1 ? "editados" : "editado"}`;
}

function EntryText({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}
