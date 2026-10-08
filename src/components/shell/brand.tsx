import { cn } from "@/lib/utils";

/** Marca: grade 2x2 (a "planilha"), com uma célula na cor de destaque. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.3" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.3" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" className="fill-primary" />
      </svg>
    </span>
  );
}
