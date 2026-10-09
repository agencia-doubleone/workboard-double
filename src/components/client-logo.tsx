import { cn, getInitials } from "@/lib/utils";

type ClientLogoProps = {
  name: string;
  /** URL já resolvida (resolveMediaUrl no servidor), ou null: mostra as iniciais. */
  logoUrl: string | null;
  className?: string;
};

/**
 * Logo do cliente numa caixa quadrada, sem moldura. Diferente do avatar, não
 * recorta: logos largos aparecem inteiros (object-contain). Sem logo, as iniciais
 * num fundo neutro.
 */
export function ClientLogo({ name, logoUrl, className }: ClientLogoProps) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50 text-xs font-semibold text-muted-foreground",
        logoUrl && "border-transparent bg-transparent",
        className,
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arquivo do CDN, já reduzido no envio
        <img src={logoUrl} alt="" className="size-full rounded-[inherit] object-contain" />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
