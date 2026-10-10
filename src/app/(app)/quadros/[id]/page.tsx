import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PageSkeleton } from "@/components/shell/page-skeleton";
import { db } from "@/db";
import { requireSession } from "@/lib/session";
import { listTeamMembers } from "@/server/jobs";
import { getMediaUrl, isMediaConfigured } from "@/server/media";
import {
  canManageWhiteboard,
  findAccessibleWhiteboard,
  listLinkableJobs,
  listWhiteboardElements,
} from "@/server/whiteboards";
import { toPersonView } from "../present";
import { BoardScreen } from "./board-screen";

export const metadata: Metadata = { title: "Quadro" };

// O quadro aberto: o Excalidraw ocupa a área de conteúdo inteira.
export default function QuadroPage({ params }: PageProps<"/quadros/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BoardContent params={params} />
    </Suspense>
  );
}

async function BoardContent({ params }: { params: PageProps<"/quadros/[id]">["params"] }) {
  const { user } = await requireSession();
  const viewer = { id: user.id, isAdmin: user.role === "admin" };
  const { id } = await params;
  // Quadro pessoal de outra pessoa, ou sem acesso: para quem vê, "não existe".
  const found = z.uuid().safeParse(id).success ? await findAccessibleWhiteboard(db, id, viewer) : null;
  if (!found) notFound();
  const { board } = found;
  const manageable = canManageWhiteboard(found, viewer);

  const [{ elements, cursor }, people, jobs] = await Promise.all([
    listWhiteboardElements(db, board.id),
    listTeamMembers(db),
    manageable ? listLinkableJobs(db, viewer) : Promise.resolve([]),
  ]);
  // O trabalho vinculado entra na lista mesmo se não estiver mais ativo.
  const jobOptions = found.job && !jobs.some((job) => job.id === found.job!.id) ? [found.job, ...jobs] : jobs;

  return (
    <BoardScreen
      board={{ id: board.id, title: board.title, access: board.access, job: found.job }}
      elements={elements}
      cursor={cursor.toISOString()}
      viewerId={user.id}
      people={people.map(toPersonView)}
      mediaBaseUrl={getMediaUrl("")}
      uploadsEnabled={isMediaConfigured()}
      manage={
        manageable
          ? {
              initial: {
                whiteboardId: board.id,
                title: board.title,
                access: board.access,
                memberIds: found.members.map((member) => member.id),
                jobId: board.jobId,
              },
              jobs: jobOptions,
              ownerOnlyPrivate: board.ownerId !== user.id,
            }
          : null
      }
    />
  );
}
