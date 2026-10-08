export { cn } from "cn"

/** Iniciais para avatares: primeira letra do primeiro e do último nome. */
export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return ((parts[0]?.[0] ?? "") + last).toUpperCase();
}
