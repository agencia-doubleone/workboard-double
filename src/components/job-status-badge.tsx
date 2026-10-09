import { cn } from "@/lib/utils";

/** Selo de status de trabalho, nas cores cadastradas pelos admins. */
export function JobStatusBadge({
  name,
  textColor,
  backgroundColor,
  className,
}: {
  name: string;
  textColor: string;
  backgroundColor: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center truncate rounded-md px-2 text-xs font-semibold whitespace-nowrap",
        className,
      )}
      // Cores escolhidas no cadastro do status (não seguem o tema, de propósito).
      style={{ color: textColor, backgroundColor }}
    >
      {name}
    </span>
  );
}
