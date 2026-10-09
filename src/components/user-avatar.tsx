import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  /** URL já resolvida (resolveMediaUrl no servidor). Sem foto, mostra as iniciais. */
  imageUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  /** Texto alternativo da foto; vazio quando o nome já aparece ao lado. */
  alt?: string;
};

/** Avatar quadrado arredondado, na linguagem do app. Tamanho e raio via className. */
export function UserAvatar({ name, imageUrl, className, fallbackClassName, alt = "" }: UserAvatarProps) {
  return (
    <Avatar className={cn("size-8 rounded-md after:rounded-[inherit]", className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt={alt} className="rounded-[inherit]" />}
      <AvatarFallback
        className={cn(
          "rounded-[inherit] bg-muted text-[11px] font-semibold text-foreground",
          fallbackClassName,
        )}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
