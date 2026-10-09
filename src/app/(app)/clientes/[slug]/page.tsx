import { ArchiveIcon, ArrowLeftIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CLIENT_LINK_ICONS } from "@/components/brand-icons";
import { ClientLogo } from "@/components/client-logo";
import { Hint } from "@/components/hint";
import { RichTextContent } from "@/components/rich-text-editor";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { CLIENT_LINKS, displayUrl, formatAgeRange, formatGenders, formatSocialClasses } from "@/lib/clients";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { listAuditLogs } from "@/server/audit/queries";
import { findClientBySlug, listCredentials } from "@/server/clients";
import { resolveMediaUrl } from "@/server/media";
import { isVaultConfigured } from "@/server/vault";
import { presentAuditRow } from "../../auditoria/present";
import { clientLinks } from "../present";
import type { CredentialRow } from "../types";
import { ClientActions } from "./client-actions";
import { CredentialsSection } from "./credentials-section";

export const metadata: Metadata = { title: "Cliente" };

const HISTORY_LIMIT = 8;

export default function ClientePage({ params }: PageProps<"/clientes/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientContent params={params} />
    </Suspense>
  );
}

async function ClientContent({ params }: { params: PageProps<"/clientes/[slug]">["params"] }) {
  const { user } = await requireSession();
  const isAdmin = user.role === "admin";
  const { slug } = await params;
  const client = await findClientBySlug(db, slug);
  // Arquivado some para a equipe; o admin ainda abre (para consultar ou reativar).
  if (!client || (client.archivedAt && !isAdmin)) notFound();

  const [credentials, history] = await Promise.all([
    listCredentials(db, client.id),
    isAdmin ? listAuditLogs(db, { entity: { type: "client", id: client.id } }) : null,
  ]);
  const now = new Date();
  const links = clientLinks(client);
  const website = links.find((link) => link.key === "website");
  const socials = links.filter((link) => link.key !== "website");
  const archived = Boolean(client.archivedAt);

  const credentialRows: CredentialRow[] = credentials.map((item) => ({
    id: item.id,
    service: item.service,
    url: item.url,
    username: item.username,
    hasNotes: item.hasNotes,
    updated: formatRelative(item.updatedAt, now),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/clientes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ArrowLeftIcon className="size-4" />
        Clientes
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <ClientLogo
            name={client.name}
            logoUrl={resolveMediaUrl(client.logoKey)}
            className="size-16 rounded-xl text-base"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{client.name}</h1>
              {archived && (
                <Badge variant="warning">
                  <ArchiveIcon data-icon="inline-start" />
                  Arquivado
                </Badge>
              )}
            </div>
            {(website || socials.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {website && (
                  <a
                    href={website.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1.5 hover:text-foreground hover:underline"
                  >
                    <CLIENT_LINK_ICONS.website />
                    <span className="truncate">{displayUrl(website.url)}</span>
                  </a>
                )}
                {socials.length > 0 && (
                  <div className="flex gap-0.5">
                    {socials.map(({ key, url }) => {
                      const Icon = CLIENT_LINK_ICONS[key];
                      return (
                        <Hint key={key} label={CLIENT_LINKS[key].label}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={CLIENT_LINKS[key].label}
                            className="flex size-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <Icon />
                          </a>
                        </Hint>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {isAdmin && (
          <ClientActions clientId={client.id} slug={client.slug} name={client.name} archived={archived} />
        )}
      </header>

      {archived && (
        <Alert>
          <ArchiveIcon />
          <AlertDescription>
            Arquivado em {formatDateTime(client.archivedAt!)}. Não aparece na lista de clientes nem para a equipe; reative
            para voltar a usar o cofre.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações gerais</CardTitle>
            </CardHeader>
            <CardContent>
              {client.notes ? (
                <RichTextContent html={client.notes} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  Nada escrito ainda.{isAdmin && " Use “Editar” para adicionar briefing, tom de voz e contatos."}
                </p>
              )}
            </CardContent>
          </Card>

          <CredentialsSection
            clientId={client.id}
            credentials={credentialRows}
            isAdmin={isAdmin}
            vaultEnabled={isVaultConfigured()}
            archived={archived}
          />
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Público-alvo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <AudienceItem label="Faixa etária" value={formatAgeRange(client.ageMin, client.ageMax)} />
                <AudienceItem label="Gênero" value={formatGenders(client.genders)} />
                <AudienceItem label="Classe social" value={formatSocialClasses(client.socialClasses)} />
              </dl>
            </CardContent>
          </Card>

          {history && (
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
                <CardDescription>Quem mexeu no cadastro e no cofre.</CardDescription>
              </CardHeader>
              <CardContent>
                {history.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem registros.</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {history.rows.slice(0, HISTORY_LIMIT).map((row) => {
                      const event = presentAuditRow(row, now);
                      return (
                        <li key={event.id} className="flex flex-col gap-0.5 text-sm">
                          <span className="font-medium">{event.actionLabel}</span>
                          <span className="text-xs text-muted-foreground">
                            {event.actor?.name ?? event.actorFallback} ·{" "}
                            <span title={event.when.absolute}>{event.when.relative}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {history.total > HISTORY_LIMIT && (
                  <Link
                    href={`/auditoria?registro=${encodeURIComponent(`client:${client.id}`)}`}
                    className="mt-4 inline-block text-sm font-medium text-primary-ink hover:underline"
                  >
                    Ver tudo na auditoria
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function AudienceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
