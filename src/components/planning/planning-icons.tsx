import {
  ClapperboardIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  MusicIcon,
  PinIcon,
  SmartphoneIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";

import { FacebookIcon, InstagramIcon, LinkedinIcon, YoutubeIcon } from "@/components/brand-icons";
import { SOCIAL_NETWORKS, type PostKind, type SocialNetwork } from "@/lib/planning";
import { cn } from "@/lib/utils";

// Ícones de rede e de tipo de post: equipe (planejamentos) e portal.

const NETWORK_ICONS: Record<SocialNetwork, React.ComponentType<{ className?: string }>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  linkedin: LinkedinIcon,
  youtube: YoutubeIcon,
  tiktok: MusicIcon,
  pinterest: PinIcon,
};

export function NetworkIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const Icon = NETWORK_ICONS[network];
  return <Icon className={cn("size-3.5", className)} aria-label={SOCIAL_NETWORKS[network]} />;
}

export const KIND_ICONS: Record<PostKind, LucideIcon> = {
  estatico: ImageIcon,
  carrossel: GalleryHorizontalIcon,
  reels: ClapperboardIcon,
  stories: SmartphoneIcon,
  video: VideoIcon,
};
