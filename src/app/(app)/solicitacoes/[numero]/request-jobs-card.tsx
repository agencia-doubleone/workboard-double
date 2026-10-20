import { BriefcaseIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { JobStatusBadge } from "@/components/job-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { formatCalendarDate } from "@/lib/format";
import { isOverdue } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import type { RequestJobItem } from "@/server/jobs";
import { resolveMediaUrl } from "@/server/media";

const AVATARS_SHOWN = 3;

/**
 * Os trabalhos criados a partir da solicitação ("Criar trabalho"). São internos
 * da agência: nada daqui vai para o portal.
 */
export function RequestJobsCard({ requestNumber, jobs, today }: { requestNumber: number; jobs: RequestJobItem[]; today: string }) {
  const createHref = `/trabalhos/novo?solicitacao=${requestNumber}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trabalhos</CardTitle>
        <CardDescription>Internos da agência, criados a partir desta solicitação. O cliente não vê.</CardDescription>
        {jobs.length > 0 && (
          <CardAction>
            <Link href={createHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <PlusIcon data-icon="inline-start" />
              Novo
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <BriefcaseIcon className="mt-0.5 size-4 shrink-0" />
              Nenhum trabalho ainda. Crie um para a equipe fazer, com o briefing e a previsão desta solicitação.
            </p>
            <Link href={createHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <PlusIcon data-icon="inline-start" />
              Criar trabalho
            </Link>
          </div>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {jobs.map((item) => {
              const late = isOverdue(item.dueDate, item.status.isFinal, today);
              return (
                <li key={item.id}>
                  <Link
                    href={`/trabalhos/${item.pit}`}
                    className="flex flex-col gap-1.5 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">PIT {item.pit}</span>
                      <span className={cn("truncate text-sm font-medium", !item.active && "text-muted-foreground")}>{item.name}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <JobStatusBadge
                        name={item.status.name}
                        textColor={item.status.textColor}
                        backgroundColor={item.status.backgroundColor}
                        className="shrink-0"
                      />
                      {item.dueDate && (
                        <span className={cn("text-xs tabular-nums", late ? "font-medium text-destructive-ink" : "text-muted-foreground")}>
                          {formatCalendarDate(item.dueDate)}
                          {late && <span className="sr-only"> (atrasado)</span>}
                        </span>
                      )}
                      {item.assignees.length > 0 && (
                        <span className="ml-auto flex shrink-0 -space-x-1.5" title={item.assignees.map((person) => person.name).join(", ")}>
                          {item.assignees.slice(0, AVATARS_SHOWN).map((person) => (
                            <UserAvatar
                              key={person.id}
                              name={person.name}
                              imageUrl={resolveMediaUrl(person.image)}
                              className="size-6 ring-2 ring-card"
                              fallbackClassName="text-[9px]"
                            />
                          ))}
                          {item.assignees.length > AVATARS_SHOWN && (
                            <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[9px] font-semibold text-muted-foreground ring-2 ring-card">
                              +{item.assignees.length - AVATARS_SHOWN}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
