import { cn } from "@/lib/utils";

/**
 * Logo da Double One (o mesmo de public/logo-double.svg), na cor do texto
 * (currentColor) e com o viewBox recortado no desenho, sem margem.
 */
export function DoubleOneLogo({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="33.8 23.8 289.4 317.4"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Double One"
      className={cn("h-8 w-auto shrink-0", className)}
      {...props}
    >
      <path d="M244.7,341.2H69.9c-19.9,0-36.1-16.2-36.1-36.1v-73.2h70.6v44.9h114c10.5,0,19.9-4.8,26.3-12.2v76.6h0Z" />
      <path d="M112.7,23.8h174.4c19.9,0,36.1,16.2,36.1,36.1v68.9h-70.5c-2.8-38.3-35.1-68.8-74.1-68.8h0c-28.6,0-53.6,16.4-66,40.3V23.8h0Z" />
      <polygon points="323.2 137.1 323.2 341.2 252.9 341.2 252.9 275.9 253 275.9 253 216.2 187.3 216.2 253 137.1 323.2 137.1" />
      <polygon points="104.4 223.7 33.8 223.7 33.8 23.8 104.4 23.8 104.4 84.8 104.4 84.8 104.4 144.5 170.1 144.5 104.4 223.7" />
    </svg>
  );
}
