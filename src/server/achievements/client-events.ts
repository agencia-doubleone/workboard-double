import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { chatMessage, job, jobMessage, jobStatus } from "@/db/schema";
import {
  carnivalDays,
  daysBetween,
  saoPauloClock,
  weekdayOf,
  type AchievementEvent,
  type AchievementId,
} from "@/lib/achievements";
import { isBirthdayToday } from "@/lib/greeting";
import { isDoneStatus } from "@/lib/jobs";
import { isAccent } from "@/lib/preferences";
import { findConversation } from "@/server/chat";
import { canAccessJob } from "@/server/jobs";
import { findAccessibleWhiteboard } from "@/server/whiteboards";
import {
  addRecords,
  grantAchievements,
  incrementCounter,
  listUnlockedIds,
  reachedGoals,
  visibleSections,
} from "./core";

// O que o navegador avisa (tema, atalhos, segredos...) e a checagem do dia
// (datas especiais e tempo de casa). Chamados pela rota /api/conquistas; o
// aviso aparece na tela de quem pediu, por isso já voltam marcadas como vistas.

type Viewer = { id: string; name: string; isAdmin: boolean; createdAt: Date; birthday: string | null };

/** Desbloqueia as conquistas ligadas a um evento do navegador. Devolve as novas. */
export async function handleAchievementEvent(
  database: Database,
  viewer: Viewer,
  event: AchievementEvent,
  now = new Date(),
): Promise<AchievementId[]> {
  const ids = await idsForEvent(database, viewer, event, now);
  return grantAchievements(database, viewer.id, ids, { seen: true });
}

async function idsForEvent(database: Database, viewer: Viewer, event: AchievementEvent, now: Date): Promise<AchievementId[]> {
  const context = { userId: viewer.id, isAdmin: viewer.isAdmin, now };
  switch (event.type) {
    case "theme.dark":
      return ["dark-side"];
    case "sound.off":
      return ["silencio-por-favor"];
    case "celebrate.off":
      return ["estraga-prazeres"];
    case "konami":
      return ["old-school"];
    case "logo":
      return ["o-que-voce-ta-procurando"];
    case "door":
      return ["a-porta-estava-aberta"];
    case "rainbow":
      return ["alem-do-arco-iris"];
    case "accent": {
      if (!isAccent(event.accent)) return [];
      await addRecords(database, [{ userId: viewer.id, kind: "accent", refId: event.accent }]);
      return reachedGoals(database, { ...context, unlocked: await listUnlockedIds(database, viewer.id) }, ["accentsTried"]);
    }
    case "nav": {
      if (!visibleSections(viewer.isAdmin).includes(event.href)) return [];
      const [added] = await addRecords(database, [{ userId: viewer.id, kind: "nav", refId: event.href }]);
      if (!added) return [];
      return reachedGoals(database, { ...context, unlocked: await listUnlockedIds(database, viewer.id) }, ["sectionsVisited"]);
    }
    case "search.shortcut": {
      await incrementCounter(database, viewer.id, "search.shortcut");
      return reachedGoals(database, { ...context, unlocked: await listUnlockedIds(database, viewer.id) }, ["searchShortcut"]);
    }
    case "profile.visit": {
      await incrementCounter(database, viewer.id, "profile.visit");
      return reachedGoals(database, { ...context, unlocked: await listUnlockedIds(database, viewer.id) }, ["profileVisits"]);
    }
    case "search.result": {
      await addRecords(database, [{ userId: viewer.id, kind: "search.result", refId: event.key }]);
      const ids = await reachedGoals(
        database,
        { ...context, unlocked: await listUnlockedIds(database, viewer.id) },
        ["searchResultsOpened"],
      );
      const messageId = event.key.startsWith("message:") ? event.key.slice("message:".length) : null;
      if (messageId && (await isOldReadableMessage(database, viewer, messageId, now))) ids.push("arqueologo-digital");
      return ids;
    }
    case "board.crowd": {
      // As pessoas na sala só o navegador vê; aqui confere ao menos que o quadro é dela.
      const board = await findAccessibleWhiteboard(database, event.boardId, { id: viewer.id, isAdmin: viewer.isAdmin });
      return board && board.board.access !== "private" ? ["brainstorm"] : [];
    }
    case "job.visit":
      return (await isLongFinishedJob(database, viewer, event.jobId, now)) ? ["de-volta-ao-passado"] : [];
  }
}

/** Mensagem com mais de 6 meses que a pessoa pode ler (do trabalho dela ou de uma conversa dela). */
async function isOldReadableMessage(database: Database, viewer: Viewer, messageId: string, now: Date) {
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - 6);
  const [fromJob] = await database
    .select({ jobId: jobMessage.jobId, createdAt: jobMessage.createdAt })
    .from(jobMessage)
    .where(eq(jobMessage.id, messageId));
  if (fromJob) {
    return (
      fromJob.createdAt <= limit &&
      (await canAccessJob(database, { jobId: fromJob.jobId, userId: viewer.id, isAdmin: viewer.isAdmin }))
    );
  }
  const [fromChat] = await database
    .select({ conversationId: chatMessage.conversationId, createdAt: chatMessage.createdAt })
    .from(chatMessage)
    .where(eq(chatMessage.id, messageId));
  return Boolean(
    fromChat && fromChat.createdAt <= limit && (await findConversation(database, fromChat.conversationId, viewer.id)),
  );
}

/** Trabalho que a pessoa acessa e que está concluído (não cancelado) há mais de um ano. */
async function isLongFinishedJob(database: Database, viewer: Viewer, jobId: string, now: Date) {
  const [found] = await database
    .select({
      id: job.id,
      statusChangedAt: job.statusChangedAt,
      isFinal: jobStatus.isFinal,
      isCanceled: jobStatus.isCanceled,
    })
    .from(job)
    .innerJoin(jobStatus, eq(jobStatus.id, job.statusId))
    .where(eq(job.id, jobId));
  if (!found || !isDoneStatus(found)) return false;
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() - 1);
  return found.statusChangedAt <= limit && canAccessJob(database, { jobId: found.id, userId: viewer.id, isAdmin: viewer.isAdmin });
}

/**
 * Checagem do dia (ao abrir o Workboard e ao voltar para a aba): entrar pela
 * primeira vez, datas especiais e tempo de casa (pela data de cadastro).
 */
export async function checkInAchievements(database: Database, viewer: Viewer, now = new Date()) {
  const { day } = saoPauloClock(now);
  const [year, month, date] = day.split("-");
  const ids: AchievementId[] = ["bem-vindo-a-bordo"];
  if (isBirthdayToday(viewer.birthday, now)) ids.push("parabens-pra-voce");
  if (month === "12" && date === "25") ids.push("ho-ho-ho");
  if (month === "01" && date === "01") ids.push("ano-novo-vida-nova");
  if (carnivalDays(Number(year)).includes(day)) ids.push("carnaval");
  if (date === "13" && weekdayOf(day) === 5) ids.push("sexta-feira-13");
  const days = daysBetween(saoPauloClock(viewer.createdAt).day, day);
  if (days >= 30) ids.push("ja-e-de-casa");
  if (days >= 365) ids.push("faz-parte-da-mobilia");
  if (days >= 1_095) ids.push("dinossauro");
  return grantAchievements(database, viewer.id, ids, { seen: true });
}
