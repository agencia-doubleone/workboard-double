import Link from "next/link";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewWhiteboardButton } from "./new-whiteboard-button";
import type { WhiteboardCardView, WhiteboardJobOption, WhiteboardPersonView } from "./types";
import { AccessBadge, WhiteboardPreview } from "./whiteboard-card";

/** Quadros vinculados a um trabalho (na página dele), com o atalho para criar um novo já vinculado. */
export function JobWhiteboards({
  boards,
  job,
  people,
}: {
  boards: WhiteboardCardView[];
  job: WhiteboardJobOption;
  people: WhiteboardPersonView[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quadros</CardTitle>
        <CardDescription>Rascunhos e ideias deste trabalho.</CardDescription>
        <CardAction>
          <NewWhiteboardButton people={people} jobs={[]} job={job} variant="ghost" size="sm" label="Novo" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum quadro ainda.</p>
        ) : (
          <ul className="-mx-1.5 flex flex-col gap-1">
            {boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/quadros/${board.id}`}
                  className="flex items-center gap-3 rounded-lg p-1.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <WhiteboardPreview url={board.previewUrl} className="size-12 shrink-0 rounded-md border" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{board.title}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AccessBadge access={board.access} className="h-5 px-1.5 text-[11px]" />
                      <span className="truncate" title={board.updated.absolute}>
                        {board.updated.label}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
