import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { env } from "@/env";
import { companyAnniversaryYears, specialDayNow } from "@/lib/greeting";
import { todayInSaoPaulo } from "@/lib/jobs";
import { requirePortalSession } from "@/lib/portal-session";
import { countClientRequests, listClientRequests } from "@/server/client-requests";
import { listPortalNotifications } from "@/server/portal-notifications";
import { listDeliveryFilePreviews, listPendingDeliveriesOfClient } from "@/server/request-deliveries";
import { PortalHomeView } from "./_home/portal-home-view";

export const metadata: Metadata = { title: "Início" };

/** Em aberto carregadas para os números e as previsões (um cliente nunca tem tantas). */
const OPEN_REQUESTS_MAX = 100;
const NEWS_LIMIT = 6;
const PREVIEWS_PER_DELIVERY = 4;

export default function PortalHomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PortalHome />
    </Suspense>
  );
}

// Tudo do cliente do contato da sessão (nunca de parâmetro); a tela fica em PortalHomeView.
async function PortalHome() {
  const { contact, client } = await requirePortalSession();
  const now = new Date();
  const today = todayInSaoPaulo(now);
  // 1º de janeiro em Brasília (sem horário de verão desde 2019).
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00-03:00`);

  const [open, pendingDeliveries, finishedThisYear, totalRequests, news] = await Promise.all([
    listClientRequests(db, {
      viewer: { kind: "portal", portalUserId: contact.id, clientId: client.id, since: contact.createdAt },
      situation: "abertas",
      pageSize: OPEN_REQUESTS_MAX,
    }),
    listPendingDeliveriesOfClient(db, client.id),
    countClientRequests(db, client.id, { status: "finalizada", since: yearStart }),
    countClientRequests(db, client.id),
    listPortalNotifications(db, contact.id, { limit: NEWS_LIMIT }),
  ]);
  const previews = await listDeliveryFilePreviews(
    db,
    pendingDeliveries.map((delivery) => delivery.id),
    PREVIEWS_PER_DELIVERY,
  );

  return (
    <PortalHomeView
      contact={contact}
      client={client}
      now={now}
      today={today}
      anniversary={companyAnniversaryYears(client.foundedOn, specialDayNow(now, env.GREETING_PREVIEW_DATE))}
      open={open}
      pendingDeliveries={pendingDeliveries.map((delivery) => ({ ...delivery, previews: previews.get(delivery.id) ?? [] }))}
      finishedThisYear={finishedThisYear}
      totalRequests={totalRequests}
      news={news.items}
    />
  );
}
