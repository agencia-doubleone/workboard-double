import { GlobeIcon } from "lucide-react";

import type { ClientLink } from "@/lib/clients";
import { cn } from "@/lib/utils";

// Ícones de redes no traço do Lucide (que não traz mais logos de marcas).

type IconProps = React.ComponentProps<"svg">;

function StrokeIcon({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </StrokeIcon>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </StrokeIcon>
  );
}

export function LinkedinIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </StrokeIcon>
  );
}

export function YoutubeIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M2.5 17a24.1 24.1 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.1 24.1 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </StrokeIcon>
  );
}

/** Ícone de cada link do cliente (site e redes). */
export const CLIENT_LINK_ICONS: Record<ClientLink, React.ComponentType<IconProps>> = {
  website: (props) => <GlobeIcon aria-hidden="true" className={cn("size-4", props.className)} />,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  linkedin: LinkedinIcon,
  youtube: YoutubeIcon,
};
