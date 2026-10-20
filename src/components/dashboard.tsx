import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

// Blocos das telas de resumo: o Início da equipe ("Meu dia"), o início do
// portal do cliente e os relatórios. Componentes de servidor ou de cliente (sem
// estado); os números chegam prontos.

/** Um número com rótulo. `href` faz o bloco inteiro levar a algum lugar. */
export function Stat({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "good" | "bad" | "warn";
  href?: string;
}) {
  const className = "flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-raised break-inside-avoid";
  const content = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" && "text-success-ink",
          tone === "bad" && "text-destructive-ink",
          tone === "warn" && "text-warning-ink",
        )}
      >
        {value}
      </span>
      {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={cn(className, "outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50")}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** Card de uma tela de resumo: título, um link opcional no canto e o conteúdo. */
export function HomeCard({
  title,
  action,
  children,
  className,
  id,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex min-w-0 scroll-mt-6 flex-col gap-3 rounded-xl border bg-card p-4 shadow-raised", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="text-xs font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Estado vazio de um card de resumo. */
export function EmptyLine({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" />
      {children}
    </p>
  );
}
