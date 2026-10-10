"use client";

import { Loader2Icon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { jobListHref, type JobListParams } from "../trabalhos/params";
import type { JobPersonView } from "../trabalhos/types";

type PeopleTabsProps = {
  /** Equipe ativa (inclui quem está vendo), em ordem alfabética. */
  people: JobPersonView[];
  /** De quem é a planilha aberta. */
  selectedId: string;
  viewerId: string;
  /** Filtros atuais: trocar de pessoa mantém a situação, a busca e os filtros. */
  params: JobListParams;
};

/** Abas da Minha planilha para admins: a própria primeiro, depois a de cada pessoa da equipe. */
export function PeopleTabs({ people, selectedId, viewerId, params }: PeopleTabsProps) {
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
    <nav aria-label="Planilhas da equipe" className="flex gap-1 overflow-x-auto border-b">
      {ordered.map((person) => {
        const isSelf = person.id === viewerId;
        const selected = person.id === selectedId;
        return (
          <Link
            key={person.id}
            ref={selected ? selectedRef : undefined}
            href={jobListHref({ ...params, pessoa: isSelf ? undefined : person.id, pagina: 1 }, "/minha-planilha")}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className="group/tab relative flex h-10 shrink-0 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:text-foreground"
          >
            <TabAvatar person={person} />
            {isSelf ? "Você" : person.name}
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

/** Avatar que vira um indicador de carregamento enquanto a planilha da pessoa abre (mesmo tamanho). */
function TabAvatar({ person }: { person: JobPersonView }) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2Icon aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />;
  return <UserAvatar name={person.name} imageUrl={person.imageUrl} className="size-5 text-[9px]" />;
}
