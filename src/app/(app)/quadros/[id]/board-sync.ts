import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  hashElementsVersion,
  isInvisiblySmallElement,
  reconcileElements,
  restoreElements,
  ROUNDNESS,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, Collaborator, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import { toast } from "sonner";

import type { BoardPeer, BoardPointer } from "@/lib/realtime/protocol";
import {
  collaboratorColor,
  isStoredElement,
  WHITEBOARD_ELEMENT_TYPES,
  WHITEBOARD_LIMITS,
  type StoredElement,
  type WhiteboardElementType,
} from "@/lib/whiteboards";
import { getElementChanges, saveElements, savePreview } from "../actions";
import { openBoardRoom, type BoardRoom, type RoomStatus } from "./board-room";

// Sincronização de um quadro aberto, fora do React (o canvas cria uma por quadro):
// - gravar: cada elemento que mudou vai para o banco (saveElements), um pouco
//   depois de a pessoa parar, em lotes; o servidor guarda a versão maior;
// - ao vivo: o que muda vai na hora para a sala (board-room.ts), com o cursor;
//   o que chega se junta ao desenho local com reconcileElements, o mesmo
//   critério do Excalidraw (versão maior; empate, o menor versionNonce);
// - sem sala (quadro pessoal, tempo real desligado ou caído): busca o que mudou
//   no banco de tempos em tempos e ao voltar para a aba (getElementChanges, com
//   o cursor do servidor);
// - miniatura da lista: gerada aqui (exportToBlob) de tempos em tempos.
// Imagens: o elemento guarda a chave do CDN no fileId; quem abre baixa do CDN.

/** Espera depois da última mudança antes de gravar; com mudanças sem parar, grava mesmo assim. */
const SAVE_DELAY_MS = 800;
const SAVE_MAX_WAIT_MS = 5_000;
/** Lote por gravação (o corpo da Server Action tem limite de 1 MB). */
const SAVE_BATCH_BYTES = 600 * 1024;
const BROADCAST_INTERVAL_MS = 60;
const POINTER_INTERVAL_MS = 50;
/** Sem sala aberta, busca as mudanças nesse intervalo (aba visível). */
const POLL_MS = 10_000;
/** Miniatura no máximo uma vez nesse intervalo (e ao sair do quadro). */
const PREVIEW_INTERVAL_MS = 30_000;
/** Quem chega à sala recebe o que mudou há pouco (pode não estar no banco ainda). */
const RECENT_FOR_NEWCOMER_MS = 15_000;

export type SyncState = "saved" | "saving" | "error";

export type PresencePeer = { userId: string; name: string; imageUrl: string | null; color: string };

export type BoardSyncOptions = {
  boardId: string;
  /**
   * Entra na sala ao vivo (quadros coletivos). O pessoal não entra: só o dono o
   * vê, e duas abas dele se acertam pela busca no banco (economiza o Worker).
   */
  live: boolean;
  initialElements: StoredElement[];
  /** Cursor do banco para buscar o que mudar depois de abrir. */
  initialCursor: string;
  viewerId: string;
  /** Nome e foto de quem pode aparecer no quadro (id → pessoa). */
  people: Record<string, { name: string; imageUrl: string | null }>;
  /** Base dos links do CDN ("https://.../uploads/"). */
  mediaBaseUrl: string;
  onPresenceChange: (peers: PresencePeer[]) => void;
  onRoomStatusChange: (status: RoomStatus) => void;
  onSyncChange: (state: SyncState) => void;
  /** Perdeu o acesso (tirado do quadro, quadro excluído). */
  onGone: () => void;
};

type Peer = BoardPeer & { pointer?: BoardPointer };

/** De onde vêm a sala e as gravações (trocáveis para testar no navegador sem servidor). */
export type BoardSyncDeps = {
  openRoom: typeof openBoardRoom;
  saveElements: typeof saveElements;
  getElementChanges: typeof getElementChanges;
  savePreview: typeof savePreview;
};

const DEFAULT_DEPS: BoardSyncDeps = { openRoom: openBoardRoom, saveElements, getElementChanges, savePreview };

const ALLOWED_TYPES = new Set<string>(WHITEBOARD_ELEMENT_TYPES);

function isAllowedType(element: ExcalidrawElement) {
  return ALLOWED_TYPES.has(element.type as WhiteboardElementType);
}

/** Ordem do Excalidraw (índice fracionário): comparação simples de texto, não por idioma. */
export function sortByIndex<T extends object>(elements: readonly T[]) {
  const key = (element: T) => {
    const index = (element as { index?: unknown }).index;
    return typeof index === "string" ? index : "";
  };
  return [...elements].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Versão e desempate de um elemento: o mesmo critério do Excalidraw (reconcileElements) e do banco. */
type Stamp = { version: number; nonce: number };
type Versioned = { id: string; version: number; versionNonce: number };

/** `element` é mais novo que `stamp`: versão maior ou, no empate, o menor versionNonce. */
function isNewer(element: Versioned, stamp: Stamp | undefined) {
  return !stamp || element.version > stamp.version || (element.version === stamp.version && element.versionNonce < stamp.nonce);
}

/** Guarda o mais novo entre o que já se sabia e `element`. */
function remember(stamps: Map<string, Stamp>, element: Versioned) {
  if (isNewer(element, stamps.get(element.id))) stamps.set(element.id, { version: element.version, nonce: element.versionNonce });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const MIME_BY_EXTENSION: Record<string, BinaryFileData["mimeType"]> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export class BoardSync {
  private readonly api: ExcalidrawImperativeAPI;
  private readonly options: BoardSyncOptions;
  private readonly deps: BoardSyncDeps;
  /**
   * O que já foi repassado à sala e o que o banco já tem (ou vai ter) de cada
   * elemento. O que chega dos outros entra nas duas: quem mudou repassa e grava.
   * Se duas pessoas mudam o mesmo elemento ao mesmo tempo, quem ficou com a
   * versão vencedora (isNewer) é quem grava.
   */
  private readonly synced = new Map<string, Stamp>();
  private readonly saved = new Map<string, Stamp>();
  private readonly peers = new Map<string, Peer>();
  private readonly requestedFiles = new Set<string>();
  private room: BoardRoom | null = null;
  private cursor: string;
  private gone = false;
  private stopped = false;
  private lastHash: number | null = null;
  private previewDirty = false;
  private lastPreviewAt = 0;
  private warnedTooBig = false;
  private stickyCount = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private firstDirtyAt = 0;
  private saving = false;
  private saveAgain = false;
  private failures = 0;
  private broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private latestPointer: BoardPointer | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(api: ExcalidrawImperativeAPI, options: BoardSyncOptions, deps: BoardSyncDeps = DEFAULT_DEPS) {
    this.api = api;
    this.options = options;
    this.deps = deps;
    this.cursor = options.initialCursor;
    for (const element of options.initialElements) {
      remember(this.synced, element);
      remember(this.saved, element);
    }
  }

  start() {
    void this.loadMissingFiles(this.api.getSceneElements());
    if (this.options.live) this.openRoom();
    else this.options.onRoomStatusChange("off");
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === "visible" && !this.room?.isOpen()) void this.pullChanges();
    }, POLL_MS);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  private openRoom() {
    this.room = this.deps.openRoom(this.options.boardId, {
      onStatus: (status) => this.handleRoomStatus(status),
      onOpen: () => {
        // O que mudou enquanto estava fora (ou desde que a página carregou) e o que mudou aqui.
        void this.pullChanges();
        this.flushBroadcast();
      },
      onWelcome: (_session, list) => {
        this.peers.clear();
        for (const peer of list) this.peers.set(peer.session, peer);
        this.publishPeers();
      },
      onJoined: (peer) => {
        this.peers.set(peer.session, peer);
        this.publishPeers();
        // Quem chegou abriu o que estava no banco: manda o que mudou há pouco (pode não ter sido gravado).
        const since = Date.now() - RECENT_FOR_NEWCOMER_MS;
        const recent = this.api
          .getSceneElementsIncludingDeleted()
          .filter((element) => isAllowedType(element) && element.updated >= since);
        if (recent.length > 0) this.room?.sendElements(recent);
      },
      onLeft: (session) => {
        if (this.peers.delete(session)) this.publishPeers();
      },
      onPointer: (from, pointer) => {
        const peer = this.peers.get(from);
        if (!peer) return;
        this.peers.set(from, { ...peer, pointer });
        this.publishCollaborators();
      },
      onElements: (_from, elements) => this.applyRemote(elements),
      onGone: () => this.handleGone(),
    });
  }

  /** Saiu do quadro: grava o que faltou e a miniatura, e fecha a sala. */
  stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearTimeout(this.broadcastTimer);
    clearTimeout(this.pointerTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.room?.stop();
    this.room = null;
    void this.flushSave();
    void this.writePreview();
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      void this.flushSave();
      void this.writePreview();
    } else if (!this.room?.isOpen()) {
      // Voltou para a aba sem sala: o que mudou em outra aba ou com outra pessoa.
      void this.pullChanges();
    }
  };

  /** Fechar a aba com algo por gravar: o navegador pergunta antes. */
  private onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.gone || this.unsavedElements().length === 0) return;
    void this.flushSave();
    event.preventDefault();
  };

  // Mudanças locais ----------------------------------------------------------

  /** onChange do Excalidraw (a cada movimento): só age quando algum elemento mudou de versão. */
  handleChange() {
    if (this.gone || this.stopped) return;
    const hash = hashElementsVersion(this.api.getSceneElementsIncludingDeleted());
    if (hash === this.lastHash) return;
    const first = this.lastHash === null;
    this.lastHash = hash;
    // A primeira chamada é a cena que acabou de abrir: nada mudou ainda.
    if (first) return;
    this.previewDirty = true;
    this.scheduleBroadcast();
    if (this.unsavedElements().length > 0) this.scheduleSave();
  }

  /** Cursor (coordenadas da cena), para os outros verem. Só manda com alguém na sala. */
  handlePointer(payload: { pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "down" | "up" }) {
    if (!this.room?.isOpen() || this.peers.size === 0) return;
    const selected = Object.keys(this.api.getAppState().selectedElementIds).slice(0, 100);
    this.latestPointer = { x: payload.pointer.x, y: payload.pointer.y, tool: payload.pointer.tool, button: payload.button, selected };
    if (this.pointerTimer) return;
    this.pointerTimer = setTimeout(() => {
      this.pointerTimer = undefined;
      if (this.latestPointer) this.room?.sendPointer(this.latestPointer);
    }, POINTER_INTERVAL_MS);
  }

  /** Post-it: um quadrado colorido, sem borda, no meio da tela (selecionado; o canvas abre a escrita). */
  addSticky(fill: string) {
    const state = this.api.getAppState();
    const center = viewportCoordsToSceneCoords(
      { clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 },
      state,
    );
    // Vários seguidos não caem um em cima do outro.
    const shift = (this.stickyCount++ % 6) * 24;
    const size = 200;
    const [sticky] = convertToExcalidrawElements([
      {
        type: "rectangle",
        x: center.x - size / 2 + shift,
        y: center.y - size / 2 + shift,
        width: size,
        height: size,
        backgroundColor: fill,
        fillStyle: "solid",
        strokeColor: "transparent",
        strokeWidth: 1,
        roughness: 0,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        customData: { sticky: true },
      },
    ]);
    this.api.updateScene({
      elements: [...this.api.getSceneElementsIncludingDeleted(), sticky],
      appState: { selectedElementIds: { [sticky.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  // Gravação -----------------------------------------------------------------

  /** Elementos com versão nova que o banco ainda não tem. Apagado que nunca foi gravado não precisa ir. */
  private unsavedElements() {
    return this.api.getSceneElementsIncludingDeleted().filter((element) => {
      if (!isAllowedType(element)) return false;
      const known = this.saved.get(element.id);
      if (!isNewer(element, known)) return false;
      if (element.isDeleted) return known !== undefined;
      return !isInvisiblySmallElement(element);
    });
  }

  private batchesOf(elements: readonly ExcalidrawElement[]) {
    const batches: ExcalidrawElement[][] = [];
    let batch: ExcalidrawElement[] = [];
    let size = 0;
    for (const element of elements) {
      const length = JSON.stringify(element).length;
      if (length > WHITEBOARD_LIMITS.elementBytes) {
        // Grande demais para o banco: fica só aqui (e na sala). Avisa uma vez.
        remember(this.saved, element);
        if (!this.warnedTooBig) {
          this.warnedTooBig = true;
          toast.warning("Um traço ficou grande demais para salvar. Divida-o em partes menores.");
        }
        continue;
      }
      if (batch.length > 0 && (size + length > SAVE_BATCH_BYTES || batch.length >= WHITEBOARD_LIMITS.elementsPerSave)) {
        batches.push(batch);
        batch = [];
        size = 0;
      }
      batch.push(element);
      size += length;
    }
    if (batch.length > 0) batches.push(batch);
    return batches;
  }

  private scheduleSave() {
    // Já há uma nova tentativa marcada depois de uma falha: ela leva tudo.
    if (this.failures > 0 && this.saveTimer) return;
    const now = Date.now();
    if (!this.firstDirtyAt) this.firstDirtyAt = now;
    clearTimeout(this.saveTimer);
    const wait = now - this.firstDirtyAt >= SAVE_MAX_WAIT_MS ? 0 : SAVE_DELAY_MS;
    this.saveTimer = setTimeout(() => void this.flushSave(), wait);
    this.options.onSyncChange("saving");
  }

  private async flushSave(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (this.gone) return;
    if (this.saving) {
      this.saveAgain = true;
      return;
    }
    const pending = this.unsavedElements();
    if (pending.length === 0) {
      this.firstDirtyAt = 0;
      this.options.onSyncChange("saved");
      return;
    }
    this.saving = true;
    this.options.onSyncChange("saving");
    try {
      for (const batch of this.batchesOf(pending)) {
        const result = await this.deps.saveElements({ whiteboardId: this.options.boardId, elements: batch });
        if (!result.ok) {
          if (result.gone) return this.handleGone();
          throw new Error(result.error);
        }
        for (const element of batch) remember(this.saved, element);
      }
      this.failures = 0;
      this.firstDirtyAt = 0;
      this.options.onSyncChange(this.unsavedElements().length > 0 ? "saving" : "saved");
      if (!this.stopped && this.previewDirty && Date.now() - this.lastPreviewAt >= PREVIEW_INTERVAL_MS) {
        void this.writePreview();
      }
    } catch {
      // Sem rede ou servidor fora: tenta de novo, esperando cada vez mais (mesmo depois de sair, para não perder nada).
      this.failures++;
      this.options.onSyncChange("error");
      this.saveTimer = setTimeout(() => void this.flushSave(), Math.min(30_000, 2_000 * 2 ** (this.failures - 1)));
    } finally {
      this.saving = false;
      if (this.saveAgain) {
        this.saveAgain = false;
        if (!this.saveTimer) this.scheduleSave();
      }
    }
  }

  // Miniatura ----------------------------------------------------------------

  private async writePreview() {
    if (!this.previewDirty || this.gone) return;
    this.previewDirty = false;
    this.lastPreviewAt = Date.now();
    const elements = this.api.getSceneElements();
    try {
      if (elements.length === 0) {
        await this.deps.savePreview({ whiteboardId: this.options.boardId, dataUrl: "" });
        return;
      }
      const blob = await exportToBlob({
        elements,
        appState: { ...this.api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
        files: this.api.getFiles(),
        maxWidthOrHeight: 480,
        mimeType: "image/webp",
        quality: 0.75,
        exportPadding: 24,
      });
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length <= WHITEBOARD_LIMITS.previewBytes) {
        await this.deps.savePreview({ whiteboardId: this.options.boardId, dataUrl });
      }
    } catch {
      // Miniatura é um extra (ex.: imagem do CDN sem permissão de leitura): fica a anterior.
    }
  }

  // Imagens ------------------------------------------------------------------

  /** Baixa do CDN as imagens que ainda não estão carregadas. */
  private async loadMissingFiles(elements: readonly ExcalidrawElement[]) {
    const files = this.api.getFiles();
    const missing = new Set<string>();
    for (const element of elements) {
      if (element.type !== "image" || element.isDeleted || !element.fileId) continue;
      if (files[element.fileId] || this.requestedFiles.has(element.fileId)) continue;
      missing.add(element.fileId);
    }
    await Promise.all(
      [...missing].map(async (key) => {
        this.requestedFiles.add(key);
        const url = `${this.options.mediaBaseUrl}${key}`;
        const mimeType = MIME_BY_EXTENSION[key.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png";
        let dataURL = url;
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(String(response.status));
          dataURL = await blobToDataUrl(await response.blob());
        } catch {
          // Sem leitura de outra origem (CORS): mostra pelo link (a miniatura não terá a imagem).
        }
        if (this.stopped) return;
        this.api.addFiles([
          { id: key as BinaryFileData["id"], dataURL: dataURL as BinaryFileData["dataURL"], mimeType, created: Date.now() },
        ]);
      }),
    );
  }

  // Ao vivo ------------------------------------------------------------------

  private unsyncedElements() {
    return this.api.getSceneElementsIncludingDeleted().filter((element) => {
      if (!isAllowedType(element)) return false;
      const known = this.synced.get(element.id);
      if (!isNewer(element, known)) return false;
      if (element.isDeleted) return known !== undefined || this.saved.has(element.id);
      return !isInvisiblySmallElement(element);
    });
  }

  private flushBroadcast() {
    this.broadcastTimer = undefined;
    if (!this.room?.isOpen()) return;
    const changed = this.unsyncedElements();
    if (changed.length === 0) return;
    if (this.room.sendElements(changed)) {
      for (const element of changed) remember(this.synced, element);
    }
  }

  private scheduleBroadcast() {
    if (this.broadcastTimer || !this.room?.isOpen()) return;
    this.broadcastTimer = setTimeout(() => this.flushBroadcast(), BROADCAST_INTERVAL_MS);
  }

  /** Junta ao desenho o que veio de fora (sala ou banco). */
  private applyRemote(incoming: unknown[]) {
    if (this.stopped) return;
    const valid = incoming.filter(isStoredElement);
    if (valid.length === 0) return;
    // Antes de mexer na cena: o onChange que vem a seguir não deve repassar nem regravar isto.
    for (const element of valid) {
      remember(this.synced, element);
      remember(this.saved, element);
    }
    const restored = restoreElements(valid as unknown as ExcalidrawElement[], null);
    const reconciled = reconcileElements(
      this.api.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[],
      restored as unknown as RemoteExcalidrawElement[],
      this.api.getAppState(),
    );
    this.api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
    this.previewDirty = true;
    void this.loadMissingFiles(reconciled);
  }

  /** Busca no banco o que mudou desde o cursor (sem sala, ou ao voltar para ela). */
  private async pullChanges() {
    if (this.gone || this.stopped) return;
    try {
      const result = await this.deps.getElementChanges({ whiteboardId: this.options.boardId, cursor: this.cursor });
      if (!result.ok) {
        if (result.gone) this.handleGone();
        return;
      }
      this.cursor = result.cursor;
      this.applyRemote(result.elements);
    } catch {
      // Sem rede: a próxima busca acerta.
    }
  }

  private handleRoomStatus(status: RoomStatus) {
    this.options.onRoomStatusChange(status);
    if (status !== "open" && this.peers.size > 0) {
      this.peers.clear();
      this.publishPeers();
    }
  }

  private publishCollaborators() {
    if (this.stopped) return;
    const collaborators = new Map<SocketId, Collaborator>();
    for (const [session, peer] of this.peers) {
      const color = collaboratorColor(peer.userId);
      collaborators.set(session as SocketId, {
        id: peer.userId,
        socketId: session as SocketId,
        username: peer.name,
        avatarUrl: this.options.people[peer.userId]?.imageUrl ?? undefined,
        color: { background: color, stroke: color },
        ...(peer.pointer
          ? {
              pointer: { x: peer.pointer.x, y: peer.pointer.y, tool: peer.pointer.tool },
              button: peer.pointer.button,
              selectedElementIds: Object.fromEntries(peer.pointer.selected.map((id) => [id, true])),
            }
          : {}),
      });
    }
    this.api.updateScene({ collaborators });
  }

  /** Cursores no quadro e, no topo da página, quem está ali (uma vez cada pessoa, sem quem está vendo). */
  private publishPeers() {
    this.publishCollaborators();
    const byUser = new Map<string, PresencePeer>();
    for (const peer of this.peers.values()) {
      if (peer.userId === this.options.viewerId || byUser.has(peer.userId)) continue;
      const person = this.options.people[peer.userId];
      byUser.set(peer.userId, {
        userId: peer.userId,
        name: person?.name ?? peer.name,
        imageUrl: person?.imageUrl ?? null,
        color: collaboratorColor(peer.userId),
      });
    }
    this.options.onPresenceChange([...byUser.values()]);
  }

  private handleGone() {
    if (this.gone) return;
    this.gone = true;
    clearTimeout(this.saveTimer);
    this.room?.stop();
    this.room = null;
    this.peers.clear();
    this.options.onGone();
  }
}
