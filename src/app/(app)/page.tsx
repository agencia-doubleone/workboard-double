import {
  ActivityIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  CircleDotDashedIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireSession } from "@/lib/session";

// Indicadores ainda sem fonte de dados: serão ligados no roadmap.
const METRICS: { label: string; icon: LucideIcon }[] = [
  { label: "Em andamento", icon: CircleDotDashedIcon },
  { label: "Entregas na semana", icon: CalendarClockIcon },
  { label: "Atrasados", icon: TriangleAlertIcon },
  { label: "Concluídos no mês", icon: CircleCheckIcon },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <Suspense fallback="Olá">
            <Greeting />
          </Suspense>
        }
        description="Visão geral dos trabalhos da agência."
      />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4"
      >
        {METRICS.map(({ label, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-3 bg-background p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              {label}
              <Icon className="size-3.5" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-muted-foreground/60">
                —
              </span>
              <span className="text-xs text-muted-foreground">sem dados</span>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Atividade recente</h2>
          <span className="text-xs text-muted-foreground">Últimos 7 dias</span>
        </div>
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma atividade ainda</EmptyTitle>
            <EmptyDescription>
              Quando os trabalhos começarem a ser registrados, as movimentações
              aparecem aqui.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    </div>
  );
}

async function Greeting() {
  const { user } = await requireSession();
  return <>Olá, {user.name.split(" ")[0]}</>;
}
