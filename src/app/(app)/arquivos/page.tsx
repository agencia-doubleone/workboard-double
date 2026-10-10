import { ChevronLeftIcon, ChevronRightIcon, InfoIcon, Link2OffIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { isMediaConfigured, listCdnFiles, type CdnListing } from "@/server/media";
import { compareWithCdn, listMediaLibrary, mediaUsage, unregisteredUsage } from "@/server/media/library";
import { FilesFilters } from "./files-filters";
import { CleanupButton, FilesTable } from "./files-table";
import { FILES_PAGE_SIZE, filesHref, parseFilesParams, type FileSituation } from "./params";
import { isPrivateBoardImage, summarize, toFileView, toUnregisteredView } from "./present";
import type { CdnListingStatus, FileUsage, FileView } from "./types";

export const metadata: Metadata = { title: "Arquivos" };

type Entry = {
  view: () => FileView;
  folder: string;
  /** Nome que aparece na tela (chat e quadros pessoais são privados: a busca não os encontra). */
  searchable: string | null;
  usage: FileUsage;
  missing: boolean;
  createdAt: Date;
};

const SITUATION_FILTERS: Record<FileSituation, (entry: Entry) => boolean> = {
  "em-uso": (entry) => entry.usage === "used",
  // Esquecidos: os sem uso registrados e os que nem registro têm.
  "sem-uso": (entry) => entry.usage === "unused" || entry.usage === "unregistered",
  "sem-registro": (entry) => entry.usage === "unregistered",
  sumidos: (entry) => entry.missing,
  recentes: (entry) => entry.usage === "recent",
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** O que está no CDN (list.php), para achar arquivos sem registro e registros sem arquivo. */
async function loadCdnListing(): Promise<{ status: CdnListingStatus; listing: CdnListing | null }> {
  if (!isMediaConfigured()) return { status: "not-configured", listing: null };
  const result = await listCdnFiles();
  if (!result.ok) return { status: result.status === 404 ? "not-installed" : "failed", listing: null };
  return { status: result.data.truncated ? "truncated" : "ok", listing: result.data };
}

// Tudo o que está no CDN, com onde cada arquivo é usado. Os sem uso (esquecidos)
// e os sem registro ganham um selo e podem ser excluídos. Só admins.
export default function ArquivosPage({ searchParams }: PageProps<"/arquivos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FilesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FilesContent({ searchParams }: { searchParams: PageProps<"/arquivos">["searchParams"] }) {
  await requireAdmin();
  const params = parseFilesParams(await searchParams);
  const now = new Date();
  const [library, cdn] = await Promise.all([listMediaLibrary(db), loadCdnListing()]);
  const { missingIds, unregistered } = cdn.listing
    ? compareWithCdn(library, cdn.listing)
    : { missingIds: new Set<string>(), unregistered: [] };
  const summary = summarize(library, unregistered, { now, missing: missingIds.size });

  const entries: Entry[] = [
    ...library.map((item) => ({
      view: () => toFileView(item, { now, missing: missingIds.has(item.id) }),
      folder: item.folder,
      searchable: item.folder === "chat" || isPrivateBoardImage(item.uses) ? null : item.name,
      usage: mediaUsage(item, now),
      missing: missingIds.has(item.id),
      createdAt: item.createdAt,
    })),
    ...unregistered.map((file) => ({
      view: () => toUnregisteredView(file, now),
      folder: file.folder,
      searchable: file.folder === "chat" ? null : file.name,
      usage: unregisteredUsage(file, now),
      missing: false,
      createdAt: file.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const search = normalize(params.busca ?? "");
  const filtered = entries.filter((entry) => {
    if (params.pasta && entry.folder !== params.pasta) return false;
    if (params.situacao && !SITUATION_FILTERS[params.situacao](entry)) return false;
    if (search && (!entry.searchable || !normalize(entry.searchable).includes(search))) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / FILES_PAGE_SIZE));
  const page = Math.min(params.pagina, pageCount);
  const rows = filtered.slice((page - 1) * FILES_PAGE_SIZE, page * FILES_PAGE_SIZE).map((entry) => entry.view());
  const from = filtered.length === 0 ? 0 : (page - 1) * FILES_PAGE_SIZE + 1;
  const to = Math.min(page * FILES_PAGE_SIZE, filtered.length);
  const unusedDetail = [
    summary.unused.size,
    summary.unused.unregistered > 0 && `${summary.unused.unregistered} sem registro`,
    summary.recent.count > 0 && `mais ${summary.recent.count} ${summary.recent.count === 1 ? "recente" : "recentes"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Arquivos"
        description="Tudo o que está no servidor de arquivos e onde cada um aparece. Os sem uso foram esquecidos por lá e podem ser excluídos."
        actions={
          summary.unused.count > 0 && isMediaConfigured() ? (
            <CleanupButton count={summary.unused.count} size={summary.unused.size} />
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="No servidor" value={summary.total.count} detail={summary.total.size} />
        <SummaryCard label="Em uso" value={summary.used.count} detail={summary.used.size} />
        <SummaryCard
          label="Sem uso"
          value={summary.unused.count}
          detail={unusedDetail}
          highlight={summary.unused.count > 0}
        />
      </div>

      <CdnNotice status={cdn.status} missing={summary.missing} />

      <div className="flex flex-col gap-3">
        <FilesFilters params={params} />
        <FilesTable rows={rows} filtered={Boolean(params.busca || params.pasta || params.situacao)} />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {filtered.length === 0
              ? "Nenhum arquivo"
              : `${from}–${to} de ${filtered.length} ${filtered.length === 1 ? "arquivo" : "arquivos"}`}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <PageLink href={filesHref({ ...params, pagina: page - 1 })} disabled={page <= 1} label="Página anterior">
                <ChevronLeftIcon />
              </PageLink>
              <span className="px-2 tabular-nums">
                {page} / {pageCount}
              </span>
              <PageLink
                href={filesHref({ ...params, pagina: page + 1 })}
                disabled={page >= pageCount}
                label="Próxima página"
              >
                <ChevronRightIcon />
              </PageLink>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Avisos sobre a lista do servidor (list.php) e os links quebrados. */
function CdnNotice({ status, missing }: { status: CdnListingStatus; missing: number }) {
  return (
    <>
      {missing > 0 && (
        <Alert variant="destructive">
          <Link2OffIcon />
          <AlertTitle>
            {missing === 1
              ? "1 arquivo registrado não está no servidor"
              : `${missing} arquivos registrados não estão no servidor`}
          </AlertTitle>
          <AlertDescription>
            O Workboard aponta para eles, mas o arquivo sumiu e o link está quebrado. Filtre por “Não estão no
            servidor” para ver quais.
          </AlertDescription>
        </Alert>
      )}
      {status === "not-installed" && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Falta o list.php no servidor de arquivos</AlertTitle>
          <AlertDescription>
            Por enquanto, aparece só o que está registrado no Workboard. Envie o cdn/list.php pelo FTP (veja o
            cdn/README.md) para ver também os arquivos que estão lá sem registro e os registros cujo arquivo sumiu.
          </AlertDescription>
        </Alert>
      )}
      {status === "failed" && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Não foi possível ler a lista do servidor de arquivos</AlertTitle>
          <AlertDescription>Mostrando só o que está registrado no Workboard. Tente recarregar a página.</AlertDescription>
        </Alert>
      )}
      {status === "truncated" && (
        <Alert>
          <InfoIcon />
          <AlertTitle>A lista do servidor veio incompleta</AlertTitle>
          <AlertDescription>
            Há mais arquivos do que o list.php devolve de uma vez: os sem registro podem não aparecer todos, e nenhum
            registro é marcado como sumido.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  highlight = false,
}: {
  label: string;
  value: number;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-raised">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", highlight && "text-warning-ink")}>
        {value.toLocaleString("pt-BR")}
      </span>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline", size: "icon-sm" }));
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className} scroll={false}>
      {children}
    </Link>
  );
}
