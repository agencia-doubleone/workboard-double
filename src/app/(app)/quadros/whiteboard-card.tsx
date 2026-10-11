import { BriefcaseIcon, BuildingIcon, LockIcon, PresentationIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { WHITEBOARD_ACCESS, type WhiteboardAccess } from "@/lib/whiteboards";
import type { WhiteboardCardView } from "./types";
import { WhiteboardCardMenu } from "./whiteboard-card-menu";

const ACCESS_ICONS: Record<WhiteboardAccess, typeof LockIcon> = {
  private: LockIcon,
  members: UsersIcon,
  team: BuildingIcon,
};

export function AccessBadge({ access, className }: { access: WhiteboardAccess; className?: string }) {
  const Icon = ACCESS_ICONS[access];
  return (
    <Badge variant="outline" className={cn("gap-1 bg-background", className)}>
      <Icon />
      {WHITEBOARD_ACCESS[access].label}
    </Badge>
  );
}

/**
 * Miniatura do quadro. Ela é gerada no tema claro (fundo branco, como o próprio
 * quadro); no escuro, o mesmo filtro que o Excalidraw usa no desenho a inverte.
 */
export function WhiteboardPreview({ url, className }: { url: string | null; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden",
        url ? "bg-white dark:[filter:invert(93%)_hue-rotate(180deg)]" : "bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      {url ? (
        // Imagem gerada no navegador e servida pela rota da miniatura (sem otimização do next/image).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="size-full object-contain p-2" />
      ) : (
        <PresentationIcon className="size-8 opacity-40" />
      )}
    </div>
  );
}

function firstName(name: string) {
  return name.split(" ")[0];
}

export function WhiteboardCard({ board }: { board: WhiteboardCardView }) {
  const people = [...(board.owner ? [board.owner] : []), ...board.members.filter((member) => member.id !== board.owner?.id)];
  return (
    // O menu fica fora do link (botão dentro de link não vale), por cima da miniatura.
    <div className="relative">
      <WhiteboardCardLink board={board} people={people} />
      {board.canDelete && <WhiteboardCardMenu id={board.id} title={board.title} className="absolute top-2 right-2" />}
    </div>
  );
}

function WhiteboardCardLink({ board, people }: { board: WhiteboardCardView; people: WhiteboardCardView["members"] }) {
  return (
    <Link
      href={`/quadros/${board.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-raised outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="relative border-b">
        <WhiteboardPreview url={board.previewUrl} className="aspect-[16/10]" />
        <AccessBadge access={board.access} className="absolute top-2 left-2" />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <span className="truncate text-sm font-medium group-hover:underline">{board.title}</span>
        {board.job && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <BriefcaseIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              #{board.job.pit} {board.job.name}
            </span>
          </span>
        )}
        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate" title={board.updated.absolute}>
            Editado {board.updated.label}
            {board.updatedBy && ` por ${firstName(board.updatedBy)}`}
          </span>
          {people.length > 0 && (
            <span className="flex shrink-0 -space-x-1.5">
              {people.slice(0, 4).map((person) => (
                <UserAvatar
                  key={person.id}
                  name={person.name}
                  imageUrl={person.imageUrl}
                  alt={person.name}
                  className="size-5 text-[8px] ring-2 ring-card"
                />
              ))}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
