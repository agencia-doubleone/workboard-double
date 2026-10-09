import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto genérico de página (título + bloco). É o loading.tsx do (app) e o
 * fallback do <Suspense> das páginas que leem a sessão antes de mostrar o título.
 */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
