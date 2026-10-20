"use client";

import { Tabs } from "@base-ui/react/tabs";
import { createContext, useContext, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

// Abas da página da solicitação (equipe e portal): as entregas para aprovação
// e a conversa. As duas ficam montadas (a conversa guarda o rascunho e a
// posição). O endereço escolhe a aba ao abrir: #entregas (aviso de entrega) ou
// #mensagens / #mensagem-… (aviso de mensagem, busca).

export type RequestTab = "entregas" | "conversa";

const TAB_CLASS =
  "flex h-8 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-control dark:aria-selected:bg-input/50";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function tabOfHash(hash: string): RequestTab | null {
  if (hash === "#entregas") return "entregas";
  if (hash.startsWith("#mensage")) return "conversa";
  return null;
}

const SelectTabContext = createContext<(tab: RequestTab) => void>(() => {});

/** Dentro das abas: muda a aba (ex.: depois de mandar uma entrega, mostra as entregas). */
export function useSelectRequestTab() {
  return useContext(SelectTabContext);
}

export function RequestTabs({
  defaultTab,
  deliveries,
  conversation,
  deliveryCount,
  messageCount,
  attention,
  actions,
}: {
  /** A aba sem nada no endereço (ex.: no portal, Entregas quando há uma esperando resposta). */
  defaultTab: RequestTab;
  deliveries: React.ReactNode;
  conversation: React.ReactNode;
  deliveryCount: number;
  messageCount: number;
  /** Selo na aba das entregas (ex.: "Para aprovar" no portal). */
  attention?: string;
  /** Ao lado das abas (ex.: "Enviar para aprovação" na equipe). */
  actions?: React.ReactNode;
}) {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  // Clicar numa aba vale até o endereço mudar de novo (outro aviso, outro link).
  const [chosen, setChosen] = useState<{ tab: RequestTab; hash: string } | null>(null);
  const tab = (chosen?.hash === hash ? chosen.tab : null) ?? tabOfHash(hash) ?? defaultTab;
  const select = (next: RequestTab) => setChosen({ tab: next, hash });

  return (
    <SelectTabContext.Provider value={select}>
      <section id="entregas" className="flex scroll-mt-6 flex-col gap-3">
        <span id="mensagens" aria-hidden="true" className="-mt-3 block scroll-mt-6" />
        <Tabs.Root value={tab} onValueChange={(value) => select(value as RequestTab)} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs.List aria-label="Entregas e conversa" className="flex w-fit gap-1 rounded-md border bg-muted/40 p-0.5">
              <Tabs.Tab value="entregas" className={TAB_CLASS}>
                Entregas
                <Count value={deliveryCount} />
                {attention && (
                  <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                    {attention}
                  </span>
                )}
              </Tabs.Tab>
              <Tabs.Tab value="conversa" className={TAB_CLASS}>
                Conversa
                <Count value={messageCount} />
              </Tabs.Tab>
            </Tabs.List>
            {actions}
          </div>
          <Tabs.Panel value="entregas" keepMounted className="outline-none">
            {deliveries}
          </Tabs.Panel>
          <Tabs.Panel value="conversa" keepMounted className="outline-none">
            {conversation}
          </Tabs.Panel>
        </Tabs.Root>
      </section>
    </SelectTabContext.Provider>
  );
}

function Count({ value }: { value: number }) {
  return <span className={cn("text-xs tabular-nums", value === 0 ? "text-muted-foreground/60" : "text-muted-foreground")}>{value}</span>;
}
