import { toast } from "sonner";

import { PORTAL_REQUESTS_PATH } from "@/lib/portal";

/**
 * Copia o endereço da solicitação no portal, para mandar ao cliente (WhatsApp,
 * e-mail). Quem tem acesso ao portal desse cliente abre direto (depois de entrar).
 */
export async function copyPortalRequestLink(number: number) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${PORTAL_REQUESTS_PATH}/${number}`);
    toast.success("Link do portal copiado. Os contatos desse cliente abrem a solicitação direto.");
  } catch {
    toast.error("Não foi possível copiar.");
  }
}
