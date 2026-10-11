import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import type { Database } from "@/db";
import {
  chatMember,
  chatMessage,
  chatMessageAttachment,
  client,
  clientCredential,
  job,
  jobAssignee,
  jobMessage,
  jobMessageAttachment,
  jobStatus,
  media,
  planning,
  user,
  whiteboard,
} from "@/db/schema";
import { CLIENT_LINK_KEYS, CLIENT_LINKS } from "@/lib/clients";
import { formatDayLabel } from "@/lib/format";
import { splitMentions } from "@/lib/jobs";
import { messageEffectOf, messageEffectText, messageElementId, splitMessageText } from "@/lib/messages";
import {
  foldText,
  matchesWords,
  searchPit,
  searchSnippet,
  searchWords,
  type SearchGroup,
  type SearchKind,
  type SearchResult,
} from "@/lib/search";
import { WHITEBOARD_ACCESS } from "@/lib/whiteboards";
import { findUserNames } from "@/server/jobs";
import { whiteboardVisibleTo } from "@/server/whiteboards";

// Busca global (Ctrl+K). Cada grupo respeita o mesmo acesso das telas:
// trabalhos e as mensagens/arquivos deles só de quem está no trabalho (ou
// admins), chat só das conversas da pessoa, quadros pela regra dos quadros,
// clientes arquivados só para admins. Sem "server-only": roda nos scripts
// contra PGlite (por isso a URL dos arquivos vem de fora, em `mediaUrl`).
//
// A comparação ignora maiúsculas e acentos (translate no SQL, foldText no JS) e
// cada palavra precisa aparecer, em qualquer ordem e em qualquer dos campos.

const LIMITS = { job: 6, client: 5, message: 6, file: 5, link: 6, credential: 4, board: 4, planning: 3 } as const;
/** Mensagens lidas para achar links e caminhos dentro delas. */
const MESSAGE_SCAN = 40;

const FOLD_FROM = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const FOLD_TO = "aaaaaeeeeiiiiooooouuuucn";

/** Os campos juntos, minúsculos e sem acento. */
function folded(parts: SQLWrapper[]) {
  return sql`translate(lower(concat_ws(' ', ${sql.join(parts, sql`, `)})), ${FOLD_FROM}, ${FOLD_TO})`;
}

/** Todas as palavras aparecem em algum dos campos. */
function hasAllWords(parts: SQLWrapper[], words: string[]): SQL {
  const text = folded(parts);
  return and(...words.map((word) => sql`${text} like ${`%${word.replace(/[\\%_]/g, "\\$&")}%`}`))!;
}

export type SearchViewer = { id: string; isAdmin: boolean };

const GROUP_LABELS: Record<Exclude<SearchKind, "page">, string> = {
  job: "Trabalhos",
  client: "Clientes",
  message: "Mensagens",
  file: "Arquivos",
  link: "Links e caminhos",
  credential: "Acessos do cofre",
  board: "Quadros",
  planning: "Planejamentos",
};

export async function globalSearch(
  database: Database,
  viewer: SearchViewer,
  query: string,
  options: { mediaUrl: (key: string | null) => string | null; now?: Date },
): Promise<SearchGroup[]> {
  const words = searchWords(query);
  const pit = searchPit(query);
  if (words.length === 0) return [];
  const now = options.now ?? new Date();
  const when = (date: Date) => formatDayLabel(date, now);

  // Trabalho visível: admins veem todos; os outros, os em que estão.
  const jobVisible = viewer.isAdmin
    ? undefined
    : sql`exists (select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${viewer.id})`;
  const clientVisible = viewer.isAdmin ? undefined : isNull(client.archivedAt);
  // Conversas do chat: só as da própria pessoa.
  const inMyConversation = and(
    eq(chatMember.conversationId, chatMessage.conversationId),
    eq(chatMember.userId, viewer.id),
  );

  const [jobs, clients, plannings, boards, jobMessages, chatMessages, jobFiles, chatFiles, clientLinks, credentials] =
    await Promise.all([
      database
        .select({
          id: job.id,
          pit: job.pit,
          name: job.name,
          active: job.active,
          clientName: client.name,
          clientLogo: client.logoKey,
          status: { name: jobStatus.name, textColor: jobStatus.textColor, backgroundColor: jobStatus.backgroundColor },
        })
        .from(job)
        .innerJoin(client, eq(client.id, job.clientId))
        .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
        .where(
          and(
            jobVisible,
            pit !== null
              ? or(eq(job.pit, pit), hasAllWords([job.name, client.name], words))
              : hasAllWords([job.name, client.name], words),
          ),
        )
        // O PIT exato primeiro; depois os em aberto; os cancelados por último; depois os mais novos.
        .orderBy(
          ...(pit !== null ? [desc(sql`${job.pit} = ${pit}`)] : []),
          asc(jobStatus.isFinal),
          asc(jobStatus.isCanceled),
          desc(job.active),
          desc(job.createdAt),
        )
        .limit(LIMITS.job + 1),
      database
        .select({ id: client.id, name: client.name, slug: client.slug, logoKey: client.logoKey, archivedAt: client.archivedAt })
        .from(client)
        .where(and(clientVisible, hasAllWords([client.name], words)))
        .orderBy(sql`${client.archivedAt} is not null`, asc(client.name))
        .limit(LIMITS.client),
      database
        .select({ id: planning.id, clientName: client.name, slug: client.slug, logoKey: client.logoKey })
        .from(planning)
        .innerJoin(client, eq(client.id, planning.clientId))
        .where(and(clientVisible, hasAllWords([client.name, sql`'planejamento'`], words)))
        .orderBy(asc(client.name))
        .limit(LIMITS.planning),
      database
        .select({
          id: whiteboard.id,
          title: whiteboard.title,
          access: whiteboard.access,
          job: { pit: job.pit, name: job.name },
        })
        .from(whiteboard)
        .leftJoin(job, eq(job.id, whiteboard.jobId))
        .where(and(whiteboardVisibleTo(viewer), hasAllWords([whiteboard.title, job.name], words)))
        .orderBy(desc(whiteboard.contentUpdatedAt))
        .limit(LIMITS.board),
      database
        .select({
          id: jobMessage.id,
          body: jobMessage.body,
          authorName: jobMessage.authorName,
          authorImage: user.image,
          createdAt: jobMessage.createdAt,
          job: { pit: job.pit, name: job.name },
        })
        .from(jobMessage)
        .innerJoin(job, eq(job.id, jobMessage.jobId))
        .leftJoin(user, eq(user.id, jobMessage.authorId))
        .where(and(jobVisible, hasAllWords([jobMessage.body], words)))
        .orderBy(desc(jobMessage.createdAt))
        .limit(MESSAGE_SCAN),
      database
        .select({
          id: chatMessage.id,
          body: chatMessage.body,
          authorName: chatMessage.authorName,
          authorImage: user.image,
          createdAt: chatMessage.createdAt,
          conversationId: chatMessage.conversationId,
        })
        .from(chatMessage)
        .innerJoin(chatMember, inMyConversation)
        .leftJoin(user, eq(user.id, chatMessage.authorId))
        .where(hasAllWords([chatMessage.body], words))
        .orderBy(desc(chatMessage.createdAt))
        .limit(MESSAGE_SCAN),
      database
        .select({
          id: media.id,
          key: media.key,
          name: media.name,
          createdAt: media.createdAt,
          messageId: jobMessage.id,
          authorName: jobMessage.authorName,
          job: { pit: job.pit, name: job.name },
        })
        .from(jobMessageAttachment)
        .innerJoin(media, eq(media.id, jobMessageAttachment.mediaId))
        .innerJoin(jobMessage, eq(jobMessage.id, jobMessageAttachment.messageId))
        .innerJoin(job, eq(job.id, jobMessage.jobId))
        .where(and(jobVisible, hasAllWords([media.name], words)))
        .orderBy(desc(media.createdAt))
        .limit(LIMITS.file),
      database
        .select({
          id: media.id,
          key: media.key,
          name: media.name,
          createdAt: media.createdAt,
          messageId: chatMessage.id,
          authorName: chatMessage.authorName,
          conversationId: chatMessage.conversationId,
        })
        .from(chatMessageAttachment)
        .innerJoin(media, eq(media.id, chatMessageAttachment.mediaId))
        .innerJoin(chatMessage, eq(chatMessage.id, chatMessageAttachment.messageId))
        .innerJoin(chatMember, inMyConversation)
        .where(hasAllWords([media.name], words))
        .orderBy(desc(media.createdAt))
        .limit(LIMITS.file),
      database
        .select({
          name: client.name,
          slug: client.slug,
          website: client.website,
          instagram: client.instagram,
          facebook: client.facebook,
          linkedin: client.linkedin,
          youtube: client.youtube,
        })
        .from(client)
        .where(
          and(
            clientVisible,
            // Os rótulos ("instagram", "site"...) entram no texto: "rama instagram" acha o Instagram da Rama.
            hasAllWords(
              [
                client.name,
                ...CLIENT_LINK_KEYS.flatMap((key) => [sql`${foldText(CLIENT_LINKS[key].label)}::text`, client[key]]),
              ],
              words,
            ),
            or(...CLIENT_LINK_KEYS.map((key) => sql`${client[key]} is not null and ${client[key]} <> ''`)),
          ),
        )
        .orderBy(asc(client.name))
        .limit(LIMITS.link),
      database
        .select({
          id: clientCredential.id,
          service: clientCredential.service,
          url: clientCredential.url,
          clientName: client.name,
          slug: client.slug,
          logoKey: client.logoKey,
        })
        .from(clientCredential)
        .innerJoin(client, eq(client.id, clientCredential.clientId))
        .where(and(clientVisible, hasAllWords([clientCredential.service, clientCredential.url, client.name], words)))
        .orderBy(asc(client.name), asc(clientCredential.service))
        .limit(LIMITS.credential),
    ]);

  // Com quem é cada conversa (o "Conversa com Ana") e quem foi mencionado nas mensagens dos trabalhos.
  const conversationIds = [...new Set([...chatMessages, ...chatFiles].map((row) => row.conversationId))];
  const [others, names] = await Promise.all([
    conversationIds.length
      ? database
          .select({ conversationId: chatMember.conversationId, name: user.name })
          .from(chatMember)
          .innerJoin(user, eq(user.id, chatMember.userId))
          .where(and(inArray(chatMember.conversationId, conversationIds), ne(chatMember.userId, viewer.id)))
      : Promise.resolve([]),
    findUserNames(
      database,
      jobMessages.flatMap((row) => splitMentions(row.body).flatMap((part) => (part.type === "mention" ? [part.userId] : []))),
    ),
  ]);
  const conversationLabel = (conversationId: string) =>
    `Conversa com ${others.find((item) => item.conversationId === conversationId)?.name ?? "pessoa excluída"}`;
  const jobLabel = (item: { pit: number; name: string }) => `#${item.pit} ${item.name}`;
  const jobMessageText = (body: string) =>
    splitMentions(body)
      .map((part) => (part.type === "mention" ? `@${names.get(part.userId) ?? "alguém"}` : part.text))
      .join("");

  // Mensagens dos dois lados, as mais novas primeiro.
  const messages = [
    ...jobMessages.map((row) => ({
      ...row,
      text: jobMessageText(row.body),
      source: jobLabel(row.job),
      href: `/trabalhos/${row.job.pit}#${messageElementId(row.id)}`,
    })),
    ...chatMessages.map((row) => ({
      ...row,
      text: row.body,
      source: conversationLabel(row.conversationId),
      href: `/chat/${row.conversationId}#${messageElementId(row.id)}`,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Links e caminhos do drive dentro dessas mensagens, e os links cadastrados nos clientes.
  const links: SearchResult[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    for (const token of splitMessageText(message.text)) {
      if (token.type === "text") continue;
      const value = token.type === "url" ? token.url : token.path;
      if (seen.has(value) || !matchesWords(value, words)) continue;
      seen.add(value);
      links.push(
        token.type === "url"
          ? {
              key: `link:${value}`,
              kind: "link",
              title: value,
              subtitle: `Link · ${message.source} · ${when(message.createdAt)}`,
              href: value,
              external: true,
            }
          : {
              key: `path:${value}`,
              kind: "link",
              title: value,
              subtitle: `Caminho do drive · ${message.source} · ${when(message.createdAt)}`,
              href: message.href,
              copy: value,
            },
      );
    }
  }
  for (const row of clientLinks) {
    for (const key of CLIENT_LINK_KEYS) {
      const url = row[key];
      const label = CLIENT_LINKS[key].label;
      if (!url || seen.has(url) || !matchesWords(`${row.name} ${label} ${url}`, words)) continue;
      seen.add(url);
      links.push({
        key: `client-link:${row.slug}:${key}`,
        kind: "link",
        title: `${label} · ${row.name}`,
        subtitle: url,
        href: url,
        external: true,
      });
    }
  }

  const files: SearchResult[] = [
    ...jobFiles.map((row) => ({ ...row, source: jobLabel(row.job) })),
    ...chatFiles.map((row) => ({ ...row, source: conversationLabel(row.conversationId) })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, LIMITS.file)
    .flatMap((row) => {
      const url = options.mediaUrl(row.key);
      return url
        ? [
            {
              key: `file:${row.id}`,
              kind: "file" as const,
              title: row.name,
              subtitle: `${row.source} · enviado por ${row.authorName} · ${when(row.createdAt)}`,
              href: url,
              external: true,
            },
          ]
        : [];
    });

  const groups: SearchGroup[] = [
    {
      kind: "job",
      label: GROUP_LABELS.job,
      results: jobs.slice(0, LIMITS.job).map((row) => ({
        key: `job:${row.id}`,
        kind: "job",
        title: jobLabel(row),
        subtitle: row.clientName,
        href: `/trabalhos/${row.pit}`,
        status: row.status,
        badge: row.active ? undefined : "Inativo",
        imageUrl: options.mediaUrl(row.clientLogo),
        imageName: row.clientName,
      })),
      // A lista completa, com os concluídos e inativos juntos.
      more:
        jobs.length > LIMITS.job
          ? {
              label: "Ver todos os trabalhos encontrados",
              href: `${viewer.isAdmin ? "/trabalhos" : "/minha-planilha"}?${new URLSearchParams({ busca: query.trim(), situacao: "todos" })}`,
            }
          : undefined,
    },
    {
      kind: "client",
      label: GROUP_LABELS.client,
      results: clients.map((row) => ({
        key: `client:${row.id}`,
        kind: "client",
        title: row.name,
        href: `/clientes/${row.slug}`,
        badge: row.archivedAt ? "Arquivado" : undefined,
        imageUrl: options.mediaUrl(row.logoKey),
        imageName: row.name,
      })),
    },
    {
      kind: "message",
      label: GROUP_LABELS.message,
      results: messages.slice(0, LIMITS.message).map((row) => {
        const effect = messageEffectOf(row.body);
        return {
          key: `message:${row.id}`,
          kind: "message",
          title: effect ? messageEffectText(effect) : searchSnippet(row.text, words),
          subtitle: `${row.authorName} · ${row.source} · ${when(row.createdAt)}`,
          href: row.href,
          imageUrl: options.mediaUrl(row.authorImage),
          imageName: row.authorName,
        };
      }),
    },
    { kind: "file", label: GROUP_LABELS.file, results: files },
    { kind: "link", label: GROUP_LABELS.link, results: links.slice(0, LIMITS.link) },
    {
      kind: "credential",
      label: GROUP_LABELS.credential,
      results: credentials.map((row) => ({
        key: `credential:${row.id}`,
        kind: "credential",
        title: `${row.service} · ${row.clientName}`,
        subtitle: row.url ?? "Acesso sem link",
        href: `/clientes/${row.slug}#cofre`,
        imageUrl: options.mediaUrl(row.logoKey),
        imageName: row.clientName,
      })),
    },
    {
      kind: "board",
      label: GROUP_LABELS.board,
      results: boards.map((row) => ({
        key: `board:${row.id}`,
        kind: "board",
        title: row.title,
        subtitle: row.job ? `Quadro · ${jobLabel(row.job)}` : `Quadro · ${WHITEBOARD_ACCESS[row.access].label}`,
        href: `/quadros/${row.id}`,
      })),
    },
    {
      kind: "planning",
      label: GROUP_LABELS.planning,
      results: plannings.map((row) => ({
        key: `planning:${row.id}`,
        kind: "planning",
        title: `Planejamento de ${row.clientName}`,
        href: `/planejamentos/${row.slug}`,
        imageUrl: options.mediaUrl(row.logoKey),
        imageName: row.clientName,
      })),
    },
  ];
  return groups.filter((group) => group.results.length > 0);
}

