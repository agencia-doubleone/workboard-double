// Recursos das mensagens (trabalhos e chat): reações, fixadas, comandos com
// efeito e os pedaços do texto (links e caminhos do drive). Compartilhado entre
// servidor e navegador (sem banco).

/** As reações possíveis, na ordem do seletor. */
export const MESSAGE_REACTIONS = ["👍", "❤️", "😂", "😮", "🎉", "✅"] as const;
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number];

export function isMessageReaction(value: unknown): value is MessageReaction {
  return typeof value === "string" && (MESSAGE_REACTIONS as readonly string[]).includes(value);
}

/** Id do elemento da mensagem na página: o painel das fixadas e o link das favoritas (#mensagem-…) levam até ele. */
export const messageElementId = (id: string) => `mensagem-${id}`;

/** Mensagens fixadas de uma vez numa conversa (no topo, para todo mundo dela). */
export const PINNED_MESSAGES_MAX = 10;

/**
 * Comandos com efeito: a mensagem que é só o comando vira um efeito na tela de
 * todo mundo que está na conversa (e uma linha "Fulano mandou um café").
 * Aparecem como sugestão ao digitar "/" no começo da mensagem.
 */
export const MESSAGE_EFFECTS = {
  confetti: { emoji: "🎊", label: "soltou confetes", description: "Solta confetes na tela" },
  flip: { emoji: "🤸", label: "deu uma cambalhota na conversa", description: "Dá uma cambalhota na conversa" },
  coffee: { emoji: "☕", label: "mandou um café", description: "Manda um café" },
  party: { emoji: "🎉", label: "começou uma festa", description: "Começa uma festa" },
  // Secreto: não aparece na lista do "/" (é a conquista "Que Comando É Esse?").
  matrix: { emoji: "💊", label: "entrou na Matrix", description: "Chuva de letras verdes" },
} as const;
export type MessageEffect = keyof typeof MESSAGE_EFFECTS;

/** Os comandos da lista do "/" (sem o secreto). */
export const VISIBLE_MESSAGE_EFFECTS: MessageEffect[] = ["confetti", "flip", "coffee", "party"];

/** Comandos que combinam com o que foi digitado ("/", "/c"...); vazio se a mensagem não é só um "/comando". */
export function matchMessageCommands(text: string): MessageEffect[] {
  const match = text.match(/^\/([a-z]*)$/i);
  if (!match) return [];
  const query = match[1].toLowerCase();
  return VISIBLE_MESSAGE_EFFECTS.filter((name) => name.startsWith(query));
}

/** O efeito de uma mensagem que é só o comando ("/party", sem anexos); null nas outras. */
export function messageEffectOf(body: string, attachments = 0): MessageEffect | null {
  if (attachments > 0) return null;
  const command = body.trim().toLowerCase();
  if (!command.startsWith("/")) return null;
  const name = command.slice(1);
  // hasOwn: "/constructor" não é comando.
  return Object.hasOwn(MESSAGE_EFFECTS, name) ? (name as MessageEffect) : null;
}

/** Texto do efeito para prévias e avisos: "☕ mandou um café". */
export function messageEffectText(effect: MessageEffect) {
  return `${MESSAGE_EFFECTS[effect].emoji} ${MESSAGE_EFFECTS[effect].label}`;
}

/** Como o comando fica guardado: "/party" (sem espaços, minúsculo). */
export function normalizeMessageBody(body: string) {
  const effect = messageEffectOf(body);
  return effect ? `/${effect}` : body;
}

// Reações prontas para a tela.

export type ReactionView = {
  emoji: string;
  count: number;
  /** Quem vê já reagiu com esse emoji. */
  mine: boolean;
  /** Quem reagiu, na ordem (para o "Ana, Bia e você"). */
  names: string[];
};

export type ReactionEntry = { emoji: string; userId: string; name: string };

/** Agrupa as reações de uma mensagem por emoji, na ordem em que apareceram. */
export function toReactionViews(entries: ReactionEntry[], viewerId: string): ReactionView[] {
  const groups = new Map<string, ReactionView>();
  for (const entry of entries) {
    const group = groups.get(entry.emoji) ?? { emoji: entry.emoji, count: 0, mine: false, names: [] };
    group.count++;
    if (entry.userId === viewerId) group.mine = true;
    group.names.push(entry.userId === viewerId ? "você" : entry.name);
    groups.set(entry.emoji, group);
  }
  return [...groups.values()];
}

/** A minha reação ligada ou desligada, antes da resposta do servidor (para o clique parecer imediato). */
export function toggleReactionView(reactions: ReactionView[], emoji: string): ReactionView[] {
  const current = reactions.find((reaction) => reaction.emoji === emoji);
  if (!current) return [...reactions, { emoji, count: 1, mine: true, names: ["você"] }];
  if (!current.mine) {
    return reactions.map((reaction) =>
      reaction === current ? { ...reaction, count: reaction.count + 1, mine: true, names: [...reaction.names, "você"] } : reaction,
    );
  }
  if (current.count === 1) return reactions.filter((reaction) => reaction !== current);
  return reactions.map((reaction) =>
    reaction === current
      ? { ...reaction, count: reaction.count - 1, mine: false, names: reaction.names.filter((name) => name !== "você") }
      : reaction,
  );
}

/** Resposta das actions de reagir, fixar e favoritar (o estado novo da mensagem). */
export type MessageUpdateResult =
  | { ok: true; reactions?: ReactionView[]; pinned?: boolean; favorite?: boolean }
  | { ok: false; error: string };

/** Uma mensagem fixada, no painel do topo da conversa. */
export type PinnedMessageView = {
  id: string;
  authorName: string;
  /** Texto pronto (menções já como "@Nome"); vazio quando só tem anexos. */
  text: string;
  attachments: number;
  /** "08/10/2026 14:32" */
  time: string;
  pinnedBy: string | null;
};

/** "Ana", "Ana e você", "Ana, Bia e Caio". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

// Pedaços do texto: links http(s) e caminhos de pasta do Windows (o drive
// compartilhado da agência, "G:\Drives compartilhados\..."), que ganham um botão
// para copiar. Nomes de pasta podem ter espaço, então o caminho vai até o fim da
// linha (ou até um caractere que o Windows não aceita em nomes, como " < > |).

export type MessageToken =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | { type: "path"; path: string };

// O resto do caminho: até o fim da linha, um caractere proibido em nomes ou um link na mesma linha.
const PATH_REST = String.raw`(?:(?!\s*https?:\/\/)[^\r\n"<>|*?:/])*`;
const TOKEN_PATTERN = new RegExp(
  String.raw`(https?:\/\/[^\s<]+)|((?<![\p{L}\p{N}])[A-Za-z]:\\${PATH_REST}|\\\\[^\s\\/:*?"<>|]+\\${PATH_REST})`,
  "gu",
);

export function splitMessageText(text: string): MessageToken[] {
  const tokens: MessageToken[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens.at(-1);
    if (last?.type === "text") last.text += value;
    else tokens.push({ type: "text", text: value });
  };
  let cursor = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [whole, url] = match;
    // Pontuação no fim fica fora ("veja https://x.com." / "está em G:\Fotos.").
    const [, value, trailing] = url
      ? (whole.match(/^(.*?)([.,;:!?)\]]*)$/) ?? [whole, whole, ""])
      : (whole.match(/^(.*?)([\s.,;!]*)$/) ?? [whole, whole, ""]);
    pushText(text.slice(cursor, match.index));
    if (url) tokens.push({ type: "url", url: value });
    else tokens.push({ type: "path", path: value });
    pushText(trailing);
    cursor = match.index + whole.length;
  }
  pushText(text.slice(cursor));
  return tokens;
}
