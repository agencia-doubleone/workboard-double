import { and, count, desc, eq, exists, gt, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import { job, jobAssignee, jobStatus, user, whiteboard, whiteboardElement, whiteboardMember } from "@/db/schema";
import type { StoredElement, WhiteboardScope } from "@/lib/whiteboards";

// Consultas dos quadros brancos (sem "server-only": rodam também nos scripts de
// verificação contra PGlite).
//
// Quem acessa um quadro:
// - pessoal: só o dono (nem admin);
// - pessoas escolhidas: o dono, os escolhidos, os funcionários do trabalho
//   vinculado e os admins;
// - toda a equipe: todos.
// Quem gerencia (nome, acesso, exclusão): o dono e, nos coletivos, os admins.

export type WhiteboardViewer = { id: string; isAdmin: boolean };

/** Condição SQL de "o quadro aparece para essa pessoa" (mesma regra de canAccessWhiteboard). */
export function whiteboardVisibleTo(viewer: WhiteboardViewer): SQL {
  const isMember = exists(
    sql`(select 1 from ${whiteboardMember} where ${whiteboardMember.whiteboardId} = ${whiteboard.id} and ${whiteboardMember.userId} = ${viewer.id})`,
  );
  const isJobAssignee = exists(
    sql`(select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${whiteboard.jobId} and ${jobAssignee.userId} = ${viewer.id})`,
  );
  return or(
    eq(whiteboard.ownerId, viewer.id),
    eq(whiteboard.access, "team"),
    and(eq(whiteboard.access, "members"), viewer.isAdmin ? sql`true` : or(isMember, isJobAssignee)),
  )!;
}

export async function findWhiteboard(database: Database, id: string) {
  const [row] = await database
    .select({
      board: whiteboard,
      owner: { id: user.id, name: user.name, image: user.image },
      job: { id: job.id, pit: job.pit, name: job.name },
    })
    .from(whiteboard)
    .leftJoin(user, eq(user.id, whiteboard.ownerId))
    .leftJoin(job, eq(job.id, whiteboard.jobId))
    .where(eq(whiteboard.id, id))
    .limit(1);
  if (!row) return null;
  const members = await database
    .select({ id: user.id, name: user.name, image: user.image })
    .from(whiteboardMember)
    .innerJoin(user, eq(user.id, whiteboardMember.userId))
    .where(eq(whiteboardMember.whiteboardId, id))
    .orderBy(user.name);
  return { board: row.board, owner: row.owner?.id ? row.owner : null, job: row.job?.id ? row.job : null, members };
}

export type FoundWhiteboard = NonNullable<Awaited<ReturnType<typeof findWhiteboard>>>;

export async function canAccessWhiteboard(database: Database, found: FoundWhiteboard, viewer: WhiteboardViewer) {
  const { board } = found;
  if (board.ownerId === viewer.id || board.access === "team") return true;
  if (board.access === "private") return false;
  if (viewer.isAdmin || found.members.some((member) => member.id === viewer.id)) return true;
  if (!board.jobId) return false;
  const [assigned] = await database
    .select({ userId: jobAssignee.userId })
    .from(jobAssignee)
    .where(and(eq(jobAssignee.jobId, board.jobId), eq(jobAssignee.userId, viewer.id)))
    .limit(1);
  return Boolean(assigned);
}

export function canManageWhiteboard(found: FoundWhiteboard, viewer: WhiteboardViewer) {
  return found.board.ownerId === viewer.id || (viewer.isAdmin && found.board.access !== "private");
}

/** O quadro, se existir e a pessoa puder acessar; senão null (para ela, o quadro "não existe"). */
export async function findAccessibleWhiteboard(database: Database, id: string, viewer: WhiteboardViewer) {
  const found = await findWhiteboard(database, id);
  return found && (await canAccessWhiteboard(database, found, viewer)) ? found : null;
}

// Lista

export type WhiteboardListFilters = {
  viewer: WhiteboardViewer;
  search?: string;
  scope?: WhiteboardScope;
  jobId?: string;
  limit: number;
  offset: number;
};

export async function listWhiteboards(database: Database, filters: WhiteboardListFilters) {
  const { viewer } = filters;
  const conditions = [whiteboardVisibleTo(viewer)];
  if (filters.search) {
    const term = `%${filters.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(or(ilike(whiteboard.title, term), ilike(job.name, term))!);
  }
  if (filters.scope === "meus") conditions.push(eq(whiteboard.ownerId, viewer.id));
  if (filters.scope === "pessoais") conditions.push(eq(whiteboard.access, "private"));
  if (filters.scope === "trabalhos") conditions.push(isNotNull(whiteboard.jobId));
  if (filters.jobId) conditions.push(eq(whiteboard.jobId, filters.jobId));
  const where = and(...conditions);

  const editor = sql<string | null>`(select ${user.name} from ${user} where ${user.id} = ${whiteboard.contentUpdatedById})`;
  const [rows, [{ total }]] = await Promise.all([
    database
      .select({
        id: whiteboard.id,
        title: whiteboard.title,
        access: whiteboard.access,
        ownerId: whiteboard.ownerId,
        ownerName: user.name,
        ownerImage: user.image,
        job: { id: job.id, pit: job.pit, name: job.name },
        hasPreview: isNotNull(whiteboard.preview),
        previewUpdatedAt: whiteboard.previewUpdatedAt,
        contentUpdatedAt: whiteboard.contentUpdatedAt,
        contentUpdatedByName: editor,
      })
      .from(whiteboard)
      .leftJoin(user, eq(user.id, whiteboard.ownerId))
      .leftJoin(job, eq(job.id, whiteboard.jobId))
      .where(where)
      .orderBy(desc(whiteboard.contentUpdatedAt), desc(whiteboard.createdAt))
      .limit(filters.limit)
      .offset(filters.offset),
    database
      .select({ total: count() })
      .from(whiteboard)
      .leftJoin(job, eq(job.id, whiteboard.jobId))
      .where(where),
  ]);

  const members = rows.length
    ? await database
        .select({ whiteboardId: whiteboardMember.whiteboardId, id: user.id, name: user.name, image: user.image })
        .from(whiteboardMember)
        .innerJoin(user, eq(user.id, whiteboardMember.userId))
        .where(inArray(whiteboardMember.whiteboardId, rows.map((row) => row.id)))
        .orderBy(user.name)
    : [];

  return {
    total,
    items: rows.map((row) => ({
      ...row,
      job: row.job?.id ? row.job : null,
      members: members.filter((member) => member.whiteboardId === row.id),
    })),
  };
}

export type WhiteboardListItem = Awaited<ReturnType<typeof listWhiteboards>>["items"][number];

// Desenho

/**
 * Busca de novo um pouco antes do cursor: uma gravação que começou antes (e
 * terminou depois) da busca anterior tem hora menor que o cursor. Repetir
 * elemento não faz mal (fica a versão maior).
 */
const CHANGES_OVERLAP_MS = 15_000;

/** Cursor da próxima busca: a última mudança vista (hora do banco, não do navegador). */
function cursorOf(rows: { updatedAt: Date }[], fallback: Date) {
  return rows.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), fallback);
}

/** O desenho para abrir o quadro (sem os apagados) e o cursor para buscar o que mudar depois. */
export async function listWhiteboardElements(database: Database, whiteboardId: string) {
  const rows = await database
    .select({ data: whiteboardElement.data, isDeleted: whiteboardElement.isDeleted, updatedAt: whiteboardElement.updatedAt })
    .from(whiteboardElement)
    .where(eq(whiteboardElement.whiteboardId, whiteboardId));
  return {
    elements: rows.filter((row) => !row.isDeleted).map((row) => row.data),
    cursor: cursorOf(rows, new Date(0)),
  };
}

/** O que mudou desde o cursor (inclusive os apagados) e o cursor novo. */
export async function listWhiteboardChanges(database: Database, whiteboardId: string, cursor: Date) {
  const rows = await database
    .select({ data: whiteboardElement.data, updatedAt: whiteboardElement.updatedAt })
    .from(whiteboardElement)
    .where(
      and(
        eq(whiteboardElement.whiteboardId, whiteboardId),
        gt(whiteboardElement.updatedAt, new Date(cursor.getTime() - CHANGES_OVERLAP_MS)),
      ),
    );
  return { elements: rows.map((row) => row.data), cursor: cursorOf(rows, cursor) };
}

/**
 * Grava os elementos que mudaram. Fica o de versão maior (empate: o menor
 * versionNonce, como no Excalidraw), então gravações fora de ordem ou repetidas
 * não desfazem nada. Devolve quantos foram de fato gravados.
 */
export async function saveWhiteboardElements(
  database: Database,
  input: { whiteboardId: string; elements: StoredElement[]; userId: string },
) {
  // O mesmo elemento duas vezes no lote: fica a versão maior (o Postgres recusa repetido).
  const latest = new Map<string, StoredElement>();
  for (const element of input.elements) {
    const current = latest.get(element.id);
    if (!current || element.version > current.version) latest.set(element.id, element);
  }
  if (latest.size === 0) return 0;

  const saved = await database
    .insert(whiteboardElement)
    .values(
      [...latest.values()].map((element) => ({
        whiteboardId: input.whiteboardId,
        id: element.id,
        version: element.version,
        versionNonce: element.versionNonce,
        isDeleted: element.isDeleted,
        data: element,
      })),
    )
    .onConflictDoUpdate({
      target: [whiteboardElement.whiteboardId, whiteboardElement.id],
      set: {
        version: sql`excluded.version`,
        versionNonce: sql`excluded.version_nonce`,
        isDeleted: sql`excluded.is_deleted`,
        data: sql`excluded.data`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${whiteboardElement.version} < excluded.version or (${whiteboardElement.version} = excluded.version and ${whiteboardElement.versionNonce} > excluded.version_nonce)`,
    })
    .returning({ id: whiteboardElement.id });

  if (saved.length > 0) {
    await database
      .update(whiteboard)
      .set({ contentUpdatedAt: sql`now()`, contentUpdatedById: input.userId, updatedAt: sql`${whiteboard.updatedAt}` })
      .where(eq(whiteboard.id, input.whiteboardId));
  }
  return saved.length;
}

/** Quais destes elementos já estão gravados no quadro (para saber o que é novo). */
export async function findSavedElementIds(database: Database, whiteboardId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await database
    .select({ id: whiteboardElement.id })
    .from(whiteboardElement)
    .where(and(eq(whiteboardElement.whiteboardId, whiteboardId), inArray(whiteboardElement.id, ids)));
  return new Set(rows.map((row) => row.id));
}

/** null: o quadro ficou em branco. */
export async function saveWhiteboardPreview(database: Database, whiteboardId: string, dataUrl: string | null) {
  await database
    .update(whiteboard)
    .set({ preview: dataUrl, previewUpdatedAt: dataUrl ? new Date() : null, updatedAt: sql`${whiteboard.updatedAt}` })
    .where(eq(whiteboard.id, whiteboardId));
}

/** Quadros vinculados a um trabalho que a pessoa vê (para a página do trabalho). */
export async function listJobWhiteboards(database: Database, jobId: string, viewer: WhiteboardViewer) {
  const { items } = await listWhiteboards(database, { viewer, jobId, limit: 50, offset: 0 });
  return items;
}

/** Imagens nos quadros (chave do CDN em `fileId`), para a tela de arquivos. */
export async function listWhiteboardImages(database: Database) {
  return database
    .selectDistinct({
      key: sql<string>`${whiteboardElement.data}->>'fileId'`,
      whiteboardId: whiteboard.id,
      title: whiteboard.title,
      access: whiteboard.access,
    })
    .from(whiteboardElement)
    .innerJoin(whiteboard, eq(whiteboard.id, whiteboardElement.whiteboardId))
    .where(
      and(
        eq(whiteboardElement.isDeleted, false),
        sql`${whiteboardElement.data}->>'type' = 'image'`,
        sql`${whiteboardElement.data}->>'fileId' is not null`,
      ),
    );
}

/** Trabalhos que dá para vincular a um quadro: os ativos e não cancelados (para quem não é admin, só os seus). */
export async function listLinkableJobs(database: Database, viewer: WhiteboardViewer) {
  const isAssignee = exists(
    sql`(select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${viewer.id})`,
  );
  const linkable = and(eq(job.active, true), eq(jobStatus.isCanceled, false));
  return database
    .select({ id: job.id, pit: job.pit, name: job.name })
    .from(job)
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(viewer.isAdmin ? linkable : and(linkable, isAssignee))
    .orderBy(desc(job.pit))
    .limit(500);
}

/** O trabalho pode ser vinculado por essa pessoa (admin: qualquer um; os outros: os seus). */
export async function canLinkJob(database: Database, jobId: string, viewer: WhiteboardViewer) {
  const [found] = await database
    .select({ id: job.id, pit: job.pit, name: job.name })
    .from(job)
    .where(
      viewer.isAdmin
        ? eq(job.id, jobId)
        : and(
            eq(job.id, jobId),
            exists(
              sql`(select 1 from ${jobAssignee} where ${jobAssignee.jobId} = ${job.id} and ${jobAssignee.userId} = ${viewer.id})`,
            ),
          ),
    )
    .limit(1);
  return found ?? null;
}
