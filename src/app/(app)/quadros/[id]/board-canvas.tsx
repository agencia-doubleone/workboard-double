"use client";

import "@excalidraw/excalidraw/index.css";

import { Excalidraw, FONT_FAMILY, Footer, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import { StickyNoteIcon } from "lucide-react";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { prepareContentImage } from "@/lib/avatar-image";
import { uploadMedia } from "@/lib/media-upload";
import { STICKY_COLORS, WHITEBOARD_MEDIA_FOLDER } from "@/lib/whiteboards";
import { BoardSync, sortByIndex, type BoardSyncDeps, type BoardSyncOptions } from "./board-sync";

// O Excalidraw do quadro. A sincronização (gravar, sala ao vivo, imagens,
// miniatura) mora em board-sync.ts; aqui ficam o visual e as ligações.

// Fontes do Excalidraw servidas pelo próprio Workboard (public/excalidraw/fonts).
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";

const UI_OPTIONS = {
  canvasActions: {
    // Sem abrir/salvar arquivo, limpar tudo nem trocar o fundo (o fundo seria só de quem trocou).
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    clearCanvas: false,
    changeViewBackgroundColor: false,
    // O tema segue o do Workboard.
    toggleTheme: false,
    saveAsImage: true,
  },
} satisfies ExcalidrawProps["UIOptions"];

/** Tema do <html> (claro/escuro), acompanhando a troca nas Configurações. */
function useDocumentDark() {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

type BoardCanvasProps = Omit<BoardSyncOptions, "live"> & {
  title: string;
  uploadsEnabled: boolean;
  /** Quadro coletivo: entra na sala ao vivo e o laser fica à mão (para apontar algo aos outros). */
  collaborative: boolean;
  /** Só para testes: sala e gravações de mentira. */
  syncDeps?: BoardSyncDeps;
};

/** Imagem colada ou arrastada: prepara (até 1600 px) e sobe ao CDN; a chave vira o fileId. */
async function uploadBoardImage(file: File) {
  const prepared = await prepareContentImage(file);
  const item = await uploadMedia(prepared, { folder: WHITEBOARD_MEDIA_FOLDER });
  return item.key;
}

async function uploadsDisabled(): Promise<string> {
  throw new Error("O envio de arquivos não está configurado.");
}

export const BoardCanvas = memo(function BoardCanvas({
  title,
  uploadsEnabled,
  collaborative,
  syncDeps,
  ...options
}: BoardCanvasProps) {
  const dark = useDocumentDark();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const syncRef = useRef<BoardSync | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Fixos desde a abertura: um refresh da página (ex.: nome trocado) não reabre a sincronização.
  const [syncOptions] = useState(() => ({ ...options, live: collaborative }));
  const [initialData] = useState(() => ({
    elements: sortByIndex(options.initialElements) as unknown as ExcalidrawElement[],
    appState: {
      // Começa no traço limpo e na fonte normal (dá para trocar nas propriedades de cada elemento).
      currentItemRoughness: 0,
      currentItemFontFamily: FONT_FAMILY.Nunito,
      viewBackgroundColor: "#ffffff",
    } satisfies Partial<AppState>,
    scrollToContent: true,
  }));

  useEffect(() => {
    if (!api) return;
    const sync = new BoardSync(api, syncOptions, syncDeps);
    syncRef.current = sync;
    sync.start();
    return () => {
      sync.stop();
      syncRef.current = null;
    };
  }, [api, syncOptions, syncDeps]);

  function addSticky(fill: string) {
    const sync = syncRef.current;
    if (!sync) return;
    sync.addSticky(fill);
    // Já abre a escrita no post-it novo: o mesmo que apertar Enter com ele selecionado.
    requestAnimationFrame(() => {
      const container = wrapperRef.current?.querySelector<HTMLElement>(".excalidraw");
      if (!container) return;
      container.focus();
      container.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    });
  }

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={() => syncRef.current?.handleChange()}
        onPointerUpdate={(payload) => syncRef.current?.handlePointer(payload)}
        generateIdForFile={uploadsEnabled ? uploadBoardImage : uploadsDisabled}
        isCollaborating={collaborative}
        theme={dark ? "dark" : "light"}
        langCode="pt-BR"
        name={title}
        UIOptions={{ ...UI_OPTIONS, tools: { image: uploadsEnabled } }}
        aiEnabled={false}
        renderTopRightUI={(isMobile) =>
          isMobile ? (
            <button
              type="button"
              className="wb-sticky-mobile"
              aria-label="Adicionar post-it"
              title="Adicionar post-it"
              onClick={() => addSticky(STICKY_COLORS[0].fill)}
            >
              <StickyNoteIcon aria-hidden="true" />
            </button>
          ) : null
        }
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.HelpHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>
              Desenhe, cole imagens ou espalhe post-its. Tudo é salvo sozinho.
            </WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
        </WelcomeScreen>
        <Footer>
          <div className="wb-sticky-palette" role="group" aria-label="Post-its">
            <StickyNoteIcon aria-hidden="true" />
            {STICKY_COLORS.map((color) => (
              <button
                key={color.fill}
                type="button"
                title={`Post-it ${color.name.toLowerCase()}`}
                aria-label={`Adicionar post-it ${color.name.toLowerCase()}`}
                onClick={() => addSticky(color.fill)}
                style={{ backgroundColor: color.fill }}
              />
            ))}
          </div>
        </Footer>
      </Excalidraw>
    </div>
  );
});
