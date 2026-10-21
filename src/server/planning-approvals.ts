import { and, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { media, planningMonth, planningPost, planningPostAsset, planningPostEvent } from "@/db/schema";
import {
  artMediaKind,
  isArtShared,
  keepValidArt,
  POST_ART_RULES,
  POST_KINDS,
  type ArtMediaKind,
  type ArtRole,
  type ArtState,
  type PlanningPostEventData,
  type PostKind,
} from "@/lib/planning";

// Artes e aprovação dos posts dos planejamentos (docs/planejamentos-no-portal.md).
// Sem "server-only": rodam também nos scripts de verificação contra PGlite.
// Gravações em várias tabelas saem como uma lista de consultas, que a action
// roda com db.batch (o neon-http não tem transação) e o teste roda em sequência.

export type PostArtRow = {
  id: string;
  postId: string;
  mediaId: string | null;
  name: string;
  role: ArtRole;
  position: number;
  version: number;
  media: { key: string; name: string; type: string } | null;
};

/** As artes da versão atual (a maior) de cada post, na ordem: arte primeiro, capa no fim. */
export async function listPostArt(database: Database, postIds: string[]) {
  const map = new Map<string, PostArtRow[]>();
  if (postIds.length === 0) return map;
  const rows = await database
    .select({
      id: planningPostAsset.id,
      postId: planningPostAsset.postId,
      mediaId: planningPostAsset.mediaId,
      name: planningPostAsset.name,
      role: planningPostAsset.role,
      position: planningPostAsset.position,
      version: planningPostAsset.version,
      media: { key: media.key, name: media.name, type: media.type },
    })
    .from(planningPostAsset)
    .leftJoin(media, eq(media.id, planningPostAsset.mediaId))
    .where(inArray(planningPostAsset.postId, postIds));
  const latest = new Map<string, number>();
  for (const row of rows) latest.set(row.postId, Math.max(latest.get(row.postId) ?? 0, row.version));
  const order = (row: PostArtRow) => (row.role === "cover" ? 1 : 0);
  for (const row of rows
    .map((row) => ({ ...row, media: row.mediaId ? row.media : null }))
    .filter((row) => row.version === latest.get(row.postId))
    .sort((a, b) => order(a) - order(b) || a.position - b.position)) {
    map.set(row.postId, [...(map.get(row.postId) ?? []), row]);
  }
  return map;
}

/** Os arquivos de arte (de todas as versões) de posts, de um mês ou de um planejamento: para apagar do CDN junto. */
export async function listArtMediaIds(database: Database, scope: { postIds: string[] } | { monthId: string } | { planningId: string }) {
  const where =
    "postIds" in scope
      ? scope.postIds.length
        ? inArray(planningPostAsset.postId, scope.postIds)
        : sql`false`
      : "monthId" in scope
        ? eq(planningPost.monthId, scope.monthId)
        : eq(planningMonth.planningId, scope.planningId);
  const rows = await database
    .selectDistinct({ mediaId: planningPostAsset.mediaId })
    .from(planningPostAsset)
    .innerJoin(planningPost, eq(planningPost.id, planningPostAsset.postId))
    .innerJoin(planningMonth, eq(planningMonth.id, planningPost.monthId))
    .where(and(where, isNotNull(planningPostAsset.mediaId)));
  return rows.map((row) => row.mediaId!);
}

export type ArtItemInput = { mediaId: string; role: ArtRole };

export type ArtChangePlan = {
  changed: boolean;
  /** Versão das linhas novas. Na mesma versão, as linhas que continuam são atualizadas no lugar. */
  version: number;
  newVersion: boolean;
  keep: { assetId: string; role: ArtRole; position: number }[];
  insert: { mediaId: string; name: string; role: ArtRole; position: number }[];
  removeAssetIds: string[];
  /** Arquivos que saem do CDN depois de gravar (só os que nenhuma versão guarda). */
  removedMediaIds: string[];
  artState: ArtState;
  count: number;
};

const ART_KIND_LABELS: Record<ArtMediaKind, string> = { image: "imagem", video: "vídeo" };

/**
 * Confere e planeja a troca das artes de um post (a lista inteira, na ordem).
 * Arquivo novo: enviado por quem salva, na pasta "planejamentos" e fora de
 * qualquer outro post. Arte que ainda não foi ao cliente é trocada no lugar
 * (o arquivo que sai é apagado); a que já foi ganha uma versão nova e a
 * anterior fica no histórico.
 */
export async function planArtChange(
  database: Database,
  input: { post: { id: string; kind: PostKind; artState: ArtState }; items: ArtItemInput[]; actorId: string },
): Promise<{ ok: false; error: string } | ({ ok: true } & ArtChangePlan)> {
  const { post, items, actorId } = input;
  const ids = items.map((item) => item.mediaId);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "O mesmo arquivo entrou duas vezes nas artes." };

  const all = await database
    .select({ id: planningPostAsset.id, mediaId: planningPostAsset.mediaId, role: planningPostAsset.role, position: planningPostAsset.position, version: planningPostAsset.version })
    .from(planningPostAsset)
    .where(eq(planningPostAsset.postId, post.id));
  const currentVersion = all.reduce((highest, row) => Math.max(highest, row.version), 0);
  const current = all.filter((row) => row.version === currentVersion);
  const currentIds = new Set(current.flatMap((row) => (row.mediaId ? [row.mediaId] : [])));

  const files = ids.length ? await database.select().from(media).where(inArray(media.id, ids)) : [];
  const byId = new Map(files.map((file) => [file.id, file]));
  const fresh = ids.filter((id) => !currentIds.has(id));
  const elsewhere = fresh.length
    ? await database
        .selectDistinct({ mediaId: planningPostAsset.mediaId })
        .from(planningPostAsset)
        .where(and(inArray(planningPostAsset.mediaId, fresh), ne(planningPostAsset.postId, post.id)))
    : [];
  if (elsewhere.length) return { ok: false, error: "Um dos arquivos já é arte de outro post. Envie de novo." };

  const classified: { mediaId: string; name: string; role: ArtRole; kind: ArtMediaKind }[] = [];
  for (const item of items) {
    const file = byId.get(item.mediaId);
    // Arquivo que já é deste post vale; um novo precisa ser de quem salva, na pasta das artes.
    if (!file || (!currentIds.has(file.id) && (file.uploadedById !== actorId || file.folder !== "planejamentos"))) {
      return { ok: false, error: "Um dos arquivos de arte é inválido. Envie de novo." };
    }
    const kind = artMediaKind(file.name);
    if (!kind) return { ok: false, error: `"${file.name}" não serve como arte: use JPG, PNG, WebP ou MP4.` };
    classified.push({ mediaId: file.id, name: file.name, role: item.role, kind });
  }
  const rules = POST_ART_RULES[post.kind];
  if (keepValidArt(post.kind, classified).length !== classified.length) {
    const wrongKind = classified.find((item) => item.role === "art" && !(rules.accepts as readonly ArtMediaKind[]).includes(item.kind));
    return {
      ok: false,
      error: wrongKind
        ? `${POST_KINDS[post.kind].label} não aceita ${ART_KIND_LABELS[wrongKind.kind]} como arte.`
        : `${POST_KINDS[post.kind].label}: ${rules.label}.`,
    };
  }

  const art = classified.filter((item) => item.role === "art");
  const ordered = [...art.map((item, position) => ({ ...item, position })), ...classified.filter((item) => item.role === "cover").map((item) => ({ ...item, position: 0 }))];
  const sameAsNow =
    ordered.length === current.length &&
    ordered.every((item) => current.some((row) => row.mediaId === item.mediaId && row.role === item.role && row.position === item.position));
  const artState: ArtState = ordered.length ? "pronta" : "sem_arte";
  const base = { count: ordered.length, artState };
  if (sameAsNow) {
    return { ok: true, changed: false, version: currentVersion, newVersion: false, keep: [], insert: [], removeAssetIds: [], removedMediaIds: [], ...base, artState: post.artState };
  }

  if (isArtShared(post.artState)) {
    return {
      ok: true,
      changed: true,
      version: currentVersion + 1,
      newVersion: true,
      keep: [],
      insert: ordered.map(({ mediaId, name, role, position }) => ({ mediaId, name, role, position })),
      removeAssetIds: [],
      removedMediaIds: [],
      ...base,
    };
  }

  const keep = ordered.flatMap((item) => {
    const row = current.find((candidate) => candidate.mediaId === item.mediaId);
    return row ? [{ assetId: row.id, role: item.role, position: item.position }] : [];
  });
  const removed = current.filter((row) => !row.mediaId || !ids.includes(row.mediaId));
  const olderIds = new Set(all.filter((row) => row.version !== currentVersion).map((row) => row.mediaId));
  return {
    ok: true,
    changed: true,
    version: Math.max(currentVersion, 1),
    newVersion: false,
    keep,
    insert: ordered.filter((item) => !currentIds.has(item.mediaId)).map(({ mediaId, name, role, position }) => ({ mediaId, name, role, position })),
    removeAssetIds: removed.map((row) => row.id),
    removedMediaIds: removed.flatMap((row) => (row.mediaId && !olderIds.has(row.mediaId) ? [row.mediaId] : [])),
    ...base,
  };
}

/** As gravações de um plano de troca de artes (rode com db.batch, ou em sequência). */
export function artChangeQueries(database: Database, postId: string, plan: ArtChangePlan, actorId: string) {
  return [
    ...(plan.removeAssetIds.length ? [database.delete(planningPostAsset).where(inArray(planningPostAsset.id, plan.removeAssetIds))] : []),
    ...plan.keep.map((row) =>
      database.update(planningPostAsset).set({ role: row.role, position: row.position }).where(eq(planningPostAsset.id, row.assetId)),
    ),
    ...(plan.insert.length
      ? [
          database
            .insert(planningPostAsset)
            .values(plan.insert.map((row) => ({ ...row, postId, version: plan.version, createdById: actorId }))),
        ]
      : []),
    database.update(planningPost).set({ artState: plan.artState }).where(eq(planningPost.id, postId)),
  ];
}

/** Desfaz a aprovação da pauta registrada por engano (só enquanto a arte não foi ao cliente). */
export async function undoBriefApproval(database: Database, input: { postId: string; actor: { id: string; name: string } }) {
  const [updated] = await database
    .update(planningPost)
    .set({ briefState: "rascunho", briefDecidedAt: null, briefDecidedByName: null, briefDecidedBySide: null, briefCaption: null })
    .where(
      and(
        eq(planningPost.id, input.postId),
        eq(planningPost.briefState, "aprovada"),
        notInArray(planningPost.artState, ["enviada", "aprovada", "alteracoes"]),
      ),
    )
    .returning({ id: planningPost.id });
  if (!updated) return false;
  await addPostEvent(database, { postId: input.postId, data: { type: "brief_approval_undone" }, actor: input.actor });
  return true;
}

export function postEventValues(input: { postId: string; data: PlanningPostEventData; actor: { id: string; name: string } }) {
  return { postId: input.postId, type: input.data.type, data: input.data, actorId: input.actor.id, actorName: input.actor.name };
}

export function addPostEvent(database: Database, input: { postId: string; data: PlanningPostEventData; actor: { id: string; name: string } }) {
  return database.insert(planningPostEvent).values(postEventValues(input));
}

/**
 * Posts de Instagram com a arte aprovada nos meses antes de `month`, do mais
 * novo para o mais antigo: aparecem no feed simulado abaixo do mês (D7).
 */
export async function listPastFeedPosts(database: Database, input: { planningId: string; month: string; limit: number }) {
  return database
    .select({ post: planningPost, month: planningMonth.month })
    .from(planningPost)
    .innerJoin(planningMonth, eq(planningMonth.id, planningPost.monthId))
    .where(
      and(
        eq(planningMonth.planningId, input.planningId),
        sql`${planningMonth.month} < ${input.month}`,
        eq(planningPost.artState, "aprovada"),
        eq(planningPost.network, "instagram"),
        ne(planningPost.kind, "stories"),
      ),
    )
    .orderBy(sql`${planningMonth.month} desc`, sql`${planningPost.date} desc nulls last`, sql`${planningPost.position} desc`)
    .limit(input.limit);
}

/**
 * Os posts do mês que a importação com "Substituir" pode apagar: sem arte
 * (nem versões antigas) e com a pauta ainda em rascunho.
 */
export async function listReplaceablePostIds(database: Database, monthId: string) {
  const rows = await database
    .select({ id: planningPost.id })
    .from(planningPost)
    .where(
      and(
        eq(planningPost.monthId, monthId),
        eq(planningPost.briefState, "rascunho"),
        eq(planningPost.artState, "sem_arte"),
        sql`not exists (select 1 from ${planningPostAsset} where ${planningPostAsset.postId} = ${planningPost.id})`,
      ),
    );
  return rows.map((row) => row.id);
}
