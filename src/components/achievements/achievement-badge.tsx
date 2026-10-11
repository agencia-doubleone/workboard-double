import Image from "next/image";

import { achievementImage, achievementOf, type AchievementId, type AchievementRarity } from "@/lib/achievements";
import { cn } from "@/lib/utils";

// Selo de uma conquista: a imagem de public/conquistas/ ou, enquanto ela não
// existe, o emoji num círculo com o contorno da raridade. Bloqueada fica cinza
// e apagada; secreta escondida mostra a secreta.png (ou "?").

export const RARITY_TEXT: Record<AchievementRarity, string> = {
  common: "text-rarity-common",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
};

const RARITY_RING: Record<AchievementRarity, string> = {
  common: "bg-rarity-common/10 ring-rarity-common/35",
  rare: "bg-rarity-rare/10 ring-rarity-rare/40",
  epic: "bg-rarity-epic/10 ring-rarity-epic/40",
  legendary: "bg-rarity-legendary/12 ring-rarity-legendary/50",
};

export function AchievementBadge({
  id,
  size = 48,
  locked = false,
  hidden = false,
  className,
}: {
  id: AchievementId;
  size?: number;
  /** Ainda não desbloqueada: cinza e apagada. */
  locked?: boolean;
  /** Secreta que quem vê ainda não desbloqueou: não revela a imagem. */
  hidden?: boolean;
  className?: string;
}) {
  const definition = achievementOf(id);
  const src = achievementImage(hidden ? "secreta" : id);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full select-none",
        !src && ["ring-1 ring-inset", hidden ? "bg-muted ring-border" : RARITY_RING[definition.rarity]],
        locked && "opacity-45 grayscale",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" width={size} height={size} className="size-full object-contain" />
      ) : (
        <span className="leading-none" style={{ fontSize: Math.round(size * 0.5) }}>
          {hidden ? "❓" : definition.emoji}
        </span>
      )}
    </span>
  );
}
