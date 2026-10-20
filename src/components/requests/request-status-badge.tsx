import { Badge } from "@/components/ui/badge";
import { REQUEST_STATUSES, type RequestStatus, type RequestStatusTone } from "@/lib/client-requests";
import { cn } from "@/lib/utils";

/**
 * Cada tom: a variante do selo e, nos tons que o Badge não tem, as cores
 * (tokens --tone-* do globals.css, com contraste conferido no claro e no escuro).
 */
const TONES: Record<RequestStatusTone, { variant: "secondary" | "warning" | "success" | "destructive" | "outline"; className?: string }> = {
  neutral: { variant: "secondary" },
  blue: { variant: "secondary", className: "bg-tone-blue/14 text-tone-blue-ink dark:bg-tone-blue/18" },
  teal: { variant: "secondary", className: "bg-tone-teal/14 text-tone-teal-ink dark:bg-tone-teal/18" },
  amber: { variant: "warning" },
  violet: { variant: "secondary", className: "bg-tone-violet/14 text-tone-violet-ink dark:bg-tone-violet/18" },
  green: { variant: "success" },
  red: { variant: "destructive" },
  muted: { variant: "outline" },
};

/** Selo do status da solicitação (cores fixas por status, iguais na equipe e no portal). */
export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const definition = REQUEST_STATUSES[status];
  const tone = TONES[definition.tone];
  return (
    <Badge variant={tone.variant} className={cn(tone.className, className)}>
      {definition.label}
    </Badge>
  );
}
