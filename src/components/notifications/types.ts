import type { NotificationData, NotificationType } from "@/lib/notifications";

/** Uma notificação do sino, pronta para o navegador. */
export type NotificationView = {
  id: string;
  type: NotificationType;
  actorName: string | null;
  actorImageUrl: string | null;
  data: NotificationData;
  /** Mensagens somadas (job.message). */
  count: number;
  href: string | null;
  unread: boolean;
  /** ISO: cursor para "Carregar mais". */
  updatedAt: string;
  time: { label: string; absolute: string };
};
