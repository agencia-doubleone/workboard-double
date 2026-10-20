"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

// A última lista de trabalhos aberta nesta aba (Minha planilha ou a lista geral,
// com os filtros e a página): o "voltar" da página do trabalho leva de volta a
// ela, e não sempre à lista padrão. Fica no sessionStorage (por aba); sem ele,
// vale o padrão que a página passar.

const KEY = "wb:jobs-list";

type StoredList = { href: string; label: string };

function read(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(value: string | null): StoredList | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as Partial<StoredList>;
    return typeof data.href === "string" && typeof data.label === "string" ? { href: data.href, label: data.label } : null;
  } catch {
    return null;
  }
}

/** Guarda a lista que está aberta (renderize na página da lista). */
export function RememberJobList({ href, label }: StoredList) {
  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({ href, label }));
    } catch {
      // Sem sessionStorage (aba privada, bloqueado): o voltar usa o padrão.
    }
  }, [href, label]);
  return null;
}

const noop = () => () => {};

/**
 * "Voltar" da página do trabalho: a última lista aberta nesta aba, se quem vê
 * ainda pode abri-la (a lista geral é só de admins); senão, `fallback`.
 */
export function JobBackLink({ fallback, isAdmin }: { fallback: StoredList; isAdmin: boolean }) {
  const stored = parse(useSyncExternalStore(noop, read, () => null));
  const allowed = stored && (stored.href.startsWith("/minha-planilha") || (isAdmin && stored.href.startsWith("/trabalhos")));
  const target = allowed ? stored : fallback;

  return (
    <Link
      href={target.href}
      className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
    >
      <ArrowLeftIcon className="size-4" />
      {target.label}
    </Link>
  );
}
