"use client";

import {
  ArrowLeftIcon,
  BriefcaseIcon,
  CheckIcon,
  CloudOffIcon,
  Loader2Icon,
  PresentationIcon,
  Settings2Icon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { reportAchievement } from "@/components/achievements/achievement-toasts";
import { Hint } from "@/components/hint";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { StoredElement, WhiteboardAccess } from "@/lib/whiteboards";
import type { WhiteboardFormValues, WhiteboardJobOption, WhiteboardPersonView } from "../types";
import { AccessBadge } from "../whiteboard-card";
import { WhiteboardDialog } from "../whiteboard-dialog";
import type { RoomStatus } from "./board-room";
import type { PresencePeer, SyncState } from "./board-sync";

// O Excalidraw só existe no navegador (e é pesado): carrega à parte, só nesta página.
const BoardCanvas = dynamic(() => import("./board-canvas").then((module) => module.BoardCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      Abrindo o quadro...
    </div>
  ),
});

type BoardScreenProps = {
  board: {
    id: string;
    title: string;
    access: WhiteboardAccess;
    job: { pit: number; name: string } | null;
  };
  elements: StoredElement[];
  cursor: string;
  viewerId: string;
  /** Equipe ativa (cursores, presença e o formulário de configuração). */
  people: WhiteboardPersonView[];
  mediaBaseUrl: string;
  uploadsEnabled: boolean;
  /** Quem pode configurar e excluir; null para os demais. */
  manage: {
    initial: WhiteboardFormValues;
    jobs: WhiteboardJobOption[];
    ownerOnlyPrivate: boolean;
  } | null;
};

export function BoardScreen({ board, elements, cursor, viewerId, people, mediaBaseUrl, uploadsEnabled, manage }: BoardScreenProps) {
  const [presence, setPresence] = useState<PresencePeer[]>([]);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");
  const [sync, setSync] = useState<SyncState>("saved");
  const [gone, setGone] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Callbacks estáveis: o canvas só renderiza de novo quando algo dele muda.
  const handleGone = useCallback(() => setGone(true), []);
  const peopleById = useMemo(
    () => Object.fromEntries(people.map((person) => [person.id, { name: person.name, imageUrl: person.imageUrl }])),
    [people],
  );

  // Mais 2 pessoas no quadro ao mesmo tempo: "Brainstorm" (avisa uma vez por quadro aberto).
  const crowdReported = useRef(false);
  useEffect(() => {
    if (crowdReported.current || presence.length < 2) return;
    crowdReported.current = true;
    reportAchievement({ type: "board.crowd", boardId: board.id });
  }, [presence, board.id]);

  return (
    // Ocupa toda a área de conteúdo (o <main> do shell é o pai posicionado), sem as margens das páginas.
    <div className="absolute inset-0 flex flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:px-3">
        <Hint label="Voltar aos quadros">
          <Link href="/quadros" aria-label="Voltar aos quadros" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <ArrowLeftIcon />
          </Link>
        </Hint>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold">{board.title}</h1>
          <AccessBadge access={board.access} className="hidden sm:inline-flex" />
          {board.job && (
            <Link
              href={`/trabalhos/${board.job.pit}`}
              className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline lg:flex"
            >
              <BriefcaseIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                #{board.job.pit} {board.job.name}
              </span>
            </Link>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <Presence peers={presence} />
          <SyncStatus sync={sync} room={roomStatus} gone={gone} personal={board.access === "private"} />
          {manage && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} aria-label="Configurar quadro">
              <Settings2Icon data-icon="inline-start" />
              <span className="hidden sm:inline">Configurar</span>
            </Button>
          )}
        </div>
      </div>

      <div className="wb-board relative min-h-0 flex-1">
        {gone ? (
          <Empty className="size-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PresentationIcon />
              </EmptyMedia>
              <EmptyTitle>Este quadro não está mais disponível</EmptyTitle>
              <EmptyDescription>
                Ele foi excluído ou o seu acesso mudou. O que você tinha feito até aqui já estava salvo.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/quadros" className={buttonVariants({ variant: "outline" })}>
                Voltar aos quadros
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <BoardCanvas
            // Passar de pessoal para coletivo (ou o contrário) abre o quadro de novo, entrando ou saindo da sala.
            key={board.access === "private" ? "pessoal" : "coletivo"}
            boardId={board.id}
            title={board.title}
            initialElements={elements}
            initialCursor={cursor}
            viewerId={viewerId}
            people={peopleById}
            mediaBaseUrl={mediaBaseUrl}
            uploadsEnabled={uploadsEnabled}
            collaborative={board.access !== "private"}
            onPresenceChange={setPresence}
            onRoomStatusChange={setRoomStatus}
            onSyncChange={setSync}
            onGone={handleGone}
          />
        )}
      </div>

      {manage && (
        <WhiteboardDialog
          // Depois de salvar, a página recarrega com os valores novos: o formulário recomeça deles.
          key={JSON.stringify(manage.initial)}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initial={manage.initial}
          people={people.filter((person) => person.id !== viewerId)}
          jobs={manage.jobs}
          ownerOnlyPrivate={manage.ownerOnlyPrivate}
          canDelete
        />
      )}
    </div>
  );
}

/** Quem mais está com o quadro aberto agora. */
function Presence({ peers }: { peers: PresencePeer[] }) {
  if (peers.length === 0) return null;
  const names = peers.map((peer) => peer.name).join(", ");
  return (
    <Hint label={`No quadro agora: ${names}`}>
      <span className="flex -space-x-1.5" aria-label={`No quadro agora: ${names}`}>
        {peers.slice(0, 5).map((peer) => (
          // Contorno na cor do cursor da pessoa no quadro.
          <span key={peer.userId} className="rounded-md" style={{ boxShadow: `0 0 0 2px ${peer.color}` }}>
            <UserAvatar name={peer.name} imageUrl={peer.imageUrl} className="size-7 text-[10px]" />
          </span>
        ))}
        {peers.length > 5 && (
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-[10px] font-medium ring-2 ring-background">
            +{peers.length - 5}
          </span>
        )}
      </span>
    </Hint>
  );
}

/** Salvo / salvando / sem conexão, e se está ao vivo. */
function SyncStatus({ sync, room, gone, personal }: { sync: SyncState; room: RoomStatus; gone: boolean; personal: boolean }) {
  if (gone) return null;
  const live = personal
    ? { label: "Quadro pessoal: só você vê. Tudo é salvo sozinho.", dot: null }
    : room === "open"
      ? { label: "Ao vivo: as mudanças dos outros aparecem na hora.", dot: "bg-success" }
      : room === "off"
        ? { label: "As mudanças dos outros aparecem a cada 10 segundos.", dot: null }
        : { label: "Reconectando ao vivo. Enquanto isso, as mudanças dos outros aparecem a cada 10 segundos.", dot: "bg-muted-foreground/50" };
  const text =
    sync === "error" ? (
      <>
        <CloudOffIcon className="size-3.5" />
        <span className="hidden sm:inline">Sem conexão, tentando salvar</span>
      </>
    ) : sync === "saving" ? (
      <>
        <Loader2Icon className="size-3.5 animate-spin" />
        <span className="hidden sm:inline">Salvando...</span>
      </>
    ) : (
      <>
        <CheckIcon className="size-3.5" />
        <span className="hidden sm:inline">Salvo</span>
      </>
    );
  return (
    <Hint label={live.label}>
      <span
        role="status"
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          sync === "error" && "font-medium text-warning-ink",
        )}
      >
        {live.dot && <span className={cn("size-2 rounded-full", live.dot)} aria-hidden="true" />}
        {text}
      </span>
    </Hint>
  );
}
