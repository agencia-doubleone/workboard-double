"use client";

import { Loader2Icon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";

import { UserAvatar } from "@/components/user-avatar";

export type AchievementPersonTab = { id: string; name: string; imageUrl: string | null; unlocked: number };

/** Abas das conquistas: as próprias primeiro, depois as de cada pessoa da equipe (com quantas cada uma tem). */
export function PeopleTabs({ people, selectedId, viewerId }: {
  people: AchievementPersonTab[];
  selectedId: string;
  viewerId: string;
}) {
  const selectedRef = useRef<HTMLAnchorElement>(null);
  const ordered = [
    ...people.filter((person) => person.id === viewerId),
    ...people.filter((person) => person.id !== viewerId),
  ];

  // Com muita gente, a aba aberta pode estar fora da área visível.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  return (
    <nav aria-label="Conquistas da equipe" className="flex gap-1 overflow-x-auto border-b">
      {ordered.map((person) => {
        const isSelf = person.id === viewerId;
        const selected = person.id === selectedId;
        return (
          <Link
            key={person.id}
            ref={selected ? selectedRef : undefined}
            href={isSelf ? "/conquistas" : `/conquistas?pessoa=${encodeURIComponent(person.id)}`}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className="group/tab relative flex h-10 shrink-0 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:text-foreground"
          >
            <TabAvatar person={person} />
            {isSelf ? "Você" : person.name}
            <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular-nums">
              {person.unlocked}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-transparent transition-colors group-aria-[current=page]/tab:bg-primary"
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Avatar que vira um indicador de carregamento enquanto a página da pessoa abre (mesmo tamanho). */
function TabAvatar({ person }: { person: AchievementPersonTab }) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2Icon aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />;
  return <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-5 text-[9px]" />;
}
