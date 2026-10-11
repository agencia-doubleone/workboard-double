"use client";

import {
  ArrowRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileIcon,
  FolderIcon,
  KeyRoundIcon,
  LinkIcon,
  Loader2Icon,
  NotebookPenIcon,
  PresentationIcon,
  SearchIcon,
  StarIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { reportAchievement } from "@/components/achievements/achievement-toasts";
import { ClientLogo } from "@/components/client-logo";
import { Hint } from "@/components/hint";
import { JobStatusBadge } from "@/components/job-status-badge";
import { NAV_SECTIONS } from "@/components/shell/nav-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { UserAvatar } from "@/components/user-avatar";
import { useModKey } from "@/hooks/use-mod-key";
import { isSearchable, matchesWords, searchWords, type SearchGroup, type SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";
import { searchEverything } from "./actions";

// Busca global: o campo no topo do sistema (ou Ctrl/⌘+K) abre uma janela que
// procura trabalhos, clientes, mensagens, arquivos, links e caminhos do drive,
// acessos do cofre, quadros e planejamentos (src/server/search.ts), além das
// páginas do menu. Setas escolhem, Enter abre, Esc fecha.

/** Espera a pessoa parar de digitar antes de buscar. */
const DEBOUNCE_MS = 220;

type Page = { title: string; href: string; icon: LucideIcon };

/** As páginas do menu (as de admin só para admins) e algumas fora dele. */
function pagesFor(isAdmin: boolean): Page[] {
  return [
    ...NAV_SECTIONS.main.items,
    ...(isAdmin ? NAV_SECTIONS.admin.items : []),
    { title: "Mensagens favoritas", href: "/chat/favoritas", icon: StarIcon },
    { title: "Meu perfil", href: "/perfil", icon: UserRoundIcon },
  ];
}

const KIND_ICONS: Partial<Record<SearchResult["kind"], LucideIcon>> = {
  file: FileIcon,
  link: LinkIcon,
  credential: KeyRoundIcon,
  board: PresentationIcon,
  planning: NotebookPenIcon,
};

export function GlobalSearch({
  isAdmin,
  searchFn = searchEverything,
}: {
  isAdmin: boolean;
  /** Só para testes: troca a busca do servidor. */
  searchFn?: typeof searchEverything;
}) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const modKey = useModKey();

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Atalho Ctrl/⌘ + K (abre e fecha). Abrir pelo atalho conta para o "Keyboard Warrior".
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (!openRef.current) reportAchievement({ type: "search.shortcut" });
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-control outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 md:flex lg:w-72 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <SearchIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Buscar no Workboard…</span>
        <KbdGroup>
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>
      <Hint label="Buscar" shortcut={[modKey, "K"]} side="bottom">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Buscar"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground md:hidden"
        >
          <SearchIcon />
        </Button>
      </Hint>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[10vh] translate-y-0 grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">Buscar no Workboard</DialogTitle>
          {/* Montado só com a janela aberta: cada abertura começa do zero. */}
          {open && <SearchPanel isAdmin={isAdmin} searchFn={searchFn} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Section = { key: string; label: string; items: Item[] };
type Item = SearchResult & { icon?: LucideIcon };

function SearchPanel({
  isAdmin,
  searchFn,
  onClose,
}: {
  isAdmin: boolean;
  searchFn: typeof searchEverything;
  onClose: () => void;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; groups: SearchGroup[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState({ query: "", index: 0 });
  const requestId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const searchable = isSearchable(query);
  useEffect(() => {
    const id = ++requestId.current;
    if (!searchable) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const groups = await searchFn({ query }).catch(() => null);
      // Uma busca mais nova já saiu: esta resposta não vale mais.
      if (id !== requestId.current) return;
      setLoading(false);
      if (groups === null) {
        toast.error("Não foi possível buscar. Sua sessão pode ter expirado.");
        return;
      }
      setFound({ query, groups });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, searchable, searchFn]);

  // Páginas: todas com o campo vazio; com texto, as que combinam.
  const words = searchWords(query);
  const pages = pagesFor(isAdmin).filter((page) => words.length === 0 || matchesWords(page.title, words));
  const groups = searchable && found ? found.groups : [];
  const sections: Section[] = [
    ...(pages.length
      ? [
          {
            key: "pages",
            label: words.length ? "Páginas" : "Ir para",
            items: pages.slice(0, words.length ? 4 : pages.length).map((page) => ({
              key: `page:${page.href}`,
              kind: "page" as const,
              title: page.title,
              href: page.href,
              icon: page.icon,
            })),
          },
        ]
      : []),
    ...groups.map((group) => ({
      key: group.kind,
      label: group.label,
      items: [
        ...group.results,
        ...(group.more
          ? [{ key: `more:${group.kind}`, kind: group.kind, title: group.more.label, href: group.more.href, icon: ArrowRightIcon }]
          : []),
      ],
    })),
  ];
  const items = sections.flatMap((section) => section.items);
  const active = items.length === 0 ? -1 : selection.query === query ? Math.min(selection.index, items.length - 1) : 0;
  const waiting = searchable && (loading || found?.query !== query);

  // A opção escolhida pelas setas fica à vista.
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function choose(item: Item) {
    // Resultados diferentes abertos (Sherlock Holmes); mensagem antiga é o "Arqueólogo Digital".
    reportAchievement({ type: "search.result", key: item.key });
    if (item.copy) {
      try {
        await navigator.clipboard.writeText(item.copy);
        toast.success("Caminho copiado. Cole no Explorador de Arquivos.");
      } catch {
        toast.error("Não foi possível copiar.");
        return;
      }
      onClose();
      return;
    }
    onClose();
    if (item.external) window.open(item.href, "_blank", "noopener,noreferrer");
    else router.push(item.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length > 0) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelection({ query, index: (active + step + items.length) % items.length });
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      void choose(items[active]);
    }
  }

  let index = -1;
  return (
    <div className="flex max-h-[min(80svh,40rem)] min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4">
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Busque trabalhos, clientes, mensagens, arquivos, links…"
          aria-label="Buscar no Workboard"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-13 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80 md:text-sm"
        />
        {waiting && <Loader2Icon aria-label="Buscando" className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
      </div>

      <div ref={listRef} id={listId} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <div key={section.key} role="group" aria-label={section.label} className="pb-2 last:pb-0">
            <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{section.label}</p>
            {section.items.map((item) => {
              index++;
              const current = index;
              return (
                <ResultRow
                  key={item.key}
                  id={`${listId}-${current}`}
                  index={current}
                  item={item}
                  selected={current === active}
                  onHover={() => setSelection({ query, index: current })}
                  onChoose={() => void choose(item)}
                />
              );
            })}
          </div>
        ))}
        {searchable && !waiting && groups.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">Nada encontrado para “{query.trim()}”.</p>
        )}
        {!searchable && query.trim() && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Digite pelo menos 2 letras (ou o número do PIT).</p>
        )}
      </div>

      <div className="hidden items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </KbdGroup>
          escolher
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Enter</Kbd>
          abrir
        </span>
        <span className="ml-auto truncate">Trabalhos pelo nome ou PIT, também os concluídos</span>
      </div>
    </div>
  );
}

function ResultRow({
  id,
  index,
  item,
  selected,
  onHover,
  onChoose,
}: {
  id: string;
  index: number;
  item: Item;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <div
      id={id}
      data-index={index}
      role="option"
      aria-selected={selected}
      onPointerMove={onHover}
      onClick={onChoose}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 select-none aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <ResultIcon item={item} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm", item.kind === "link" && item.copy && "font-mono text-[13px]")}>
          {item.title}
        </span>
        {item.subtitle && <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>}
      </span>
      {item.status && (
        <JobStatusBadge
          name={item.status.name}
          textColor={item.status.textColor}
          backgroundColor={item.status.backgroundColor}
          className="hidden shrink-0 sm:inline-flex"
        />
      )}
      {item.badge && (
        <Badge variant="outline" className="shrink-0">
          {item.badge}
        </Badge>
      )}
      {item.copy ? (
        <CopyIcon aria-label="Copia o caminho" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : item.external ? (
        <ExternalLinkIcon aria-label="Abre em outra aba" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
    </div>
  );
}

function ResultIcon({ item }: { item: Item }) {
  if (item.kind === "job" || item.kind === "client" || item.kind === "planning" || item.kind === "credential") {
    if (item.imageName && !item.icon) {
      return <ClientLogo name={item.imageName} logoUrl={item.imageUrl ?? null} className="size-8 text-[10px]" />;
    }
  }
  if (item.kind === "message" && item.imageName) {
    return <UserAvatar name={item.imageName} imageUrl={item.imageUrl ?? null} className="size-8 text-[10px]" />;
  }
  const Icon = item.icon ?? (item.kind === "link" && item.copy ? FolderIcon : KIND_ICONS[item.kind]) ?? SearchIcon;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}
