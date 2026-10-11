// Conquistas: o catálogo (nome, imagem, regra, raridade), as metas com barra de
// progresso e as contas de data. Compartilhado entre servidor e navegador (sem
// banco). Quem desbloqueia é o servidor (src/server/achievements/); a lista de
// conquistas e as regras saíram do conquistas.md (revisado pela agência).

export const ACHIEVEMENT_RARITIES = {
  common: { label: "Comum" },
  rare: { label: "Rara" },
  epic: { label: "Épica" },
  legendary: { label: "Lendária" },
} as const;
export type AchievementRarity = keyof typeof ACHIEVEMENT_RARITIES;

export const ACHIEVEMENT_CATEGORIES = {
  jobs: { label: "Trabalhos" },
  planning: { label: "Planejamentos" },
  messages: { label: "Mensagens e chat" },
  usage: { label: "Uso do sistema" },
  boards: { label: "Quadros brancos" },
  secret: { label: "Secretas" },
  dates: { label: "Datas especiais" },
  special: { label: "Especiais" },
} as const;
export type AchievementCategory = keyof typeof ACHIEVEMENT_CATEGORIES;

/** Números que as metas acompanham (calculados no servidor, a partir do lançamento). */
export type AchievementMetric =
  | "jobsCompleted"
  | "monthsFinalized"
  | "planningsResponsible"
  | "messagesSent"
  | "linkMessages"
  | "attachmentsSent"
  | "commandsUsed"
  | "reactionsUsed"
  | "reactionsReceived"
  | "mentionsReceived"
  | "favorites"
  | "accentsTried"
  | "searchShortcut"
  | "searchResultsOpened"
  | "sectionsVisited"
  | "stickies"
  | "profileVisits"
  | "daysRegistered";

type AchievementDefinition = {
  name: string;
  emoji: string;
  /** Como desbloquear (nas secretas, só aparece depois de desbloquear). */
  description: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  /** Meta com barra de progresso. Sem `value`, o servidor calcula (ex.: as seções que a pessoa vê). */
  goal?: { metric: AchievementMetric; value?: number; unit?: string };
  /** Escondida ("???") até a pessoa desbloquear. */
  secret?: boolean;
  /** Só um admin concede (na tela de conquistas da pessoa). */
  manual?: boolean;
};

/**
 * O catálogo, na ordem da tela. O id é também o nome da imagem em
 * public/conquistas/ (ex.: primeiro-de-muitos.png): mudar o id perde quem já
 * desbloqueou. Conquista nova: entra aqui e na regra do servidor
 * (src/server/achievements/), e a imagem vai para a pasta.
 */
export const ACHIEVEMENTS = {
  // Trabalhos (contam para todos os funcionários do trabalho; cada trabalho uma vez só)
  "primeiro-de-muitos": {
    name: "Primeiro de Muitos",
    emoji: "🚀",
    description: "Concluir o primeiro trabalho.",
    rarity: "common",
    category: "jobs",
    goal: { metric: "jobsCompleted", value: 1 },
  },
  "pegando-o-jeito": {
    name: "Pegando o Jeito",
    emoji: "🔟",
    description: "Concluir 10 trabalhos.",
    rarity: "common",
    category: "jobs",
    goal: { metric: "jobsCompleted", value: 10 },
  },
  maratonista: {
    name: "Maratonista",
    emoji: "🏃",
    description: "Concluir 50 trabalhos.",
    rarity: "rare",
    category: "jobs",
    goal: { metric: "jobsCompleted", value: 50 },
  },
  centenario: {
    name: "Centenário",
    emoji: "💯",
    description: "Concluir 100 trabalhos.",
    rarity: "epic",
    category: "jobs",
    goal: { metric: "jobsCompleted", value: 100 },
  },
  "lenda-da-agencia": {
    name: "Lenda da Agência",
    emoji: "🏆",
    description: "Concluir 500 trabalhos.",
    rarity: "legendary",
    category: "jobs",
    goal: { metric: "jobsCompleted", value: 500 },
  },
  "the-flash": {
    name: "The Flash",
    emoji: "⚡",
    description: "Concluir 5 trabalhos no mesmo dia.",
    rarity: "rare",
    category: "jobs",
  },
  "em-chamas": {
    name: "Em Chamas",
    emoji: "🔥",
    description: "Concluir pelo menos um trabalho em 5 dias úteis seguidos.",
    rarity: "epic",
    category: "jobs",
  },
  "missao-cumprida": {
    name: "Missão Cumprida",
    emoji: "🎯",
    description: "Concluir o último trabalho que você tinha em aberto.",
    rarity: "rare",
    category: "jobs",
  },
  pontual: {
    name: "Pontual",
    emoji: "⏰",
    description: "Entregar 10 trabalhos seguidos no prazo (concluídos até o dia da entrega).",
    rarity: "rare",
    category: "jobs",
  },
  "antes-tarde-do-que-nunca": {
    name: "Antes Tarde do que Nunca",
    emoji: "🐢",
    description: "Concluir um trabalho com mais de 30 dias de atraso.",
    rarity: "rare",
    category: "jobs",
  },
  expresso: {
    name: "Expresso",
    emoji: "🏎️",
    description: "Concluir um trabalho no mesmo dia em que ele foi cadastrado.",
    rarity: "common",
    category: "jobs",
  },
  sextou: {
    name: "Sextou!",
    emoji: "🥳",
    description: "Concluir um trabalho numa sexta-feira.",
    rarity: "common",
    category: "jobs",
  },
  "grand-finale": {
    name: "Grand Finale",
    emoji: "🎬",
    description: "Estar no trabalho de número 1.000 concluído pela agência.",
    rarity: "legendary",
    category: "jobs",
  },
  "de-volta-ao-passado": {
    name: "De Volta ao Passado",
    emoji: "🕰️",
    description: "Abrir a página de um trabalho concluído há mais de um ano.",
    rarity: "rare",
    category: "jobs",
  },

  // Planejamentos (contam para os responsáveis do planejamento)
  "o-estrategista": {
    name: "O Estrategista",
    emoji: "🧠",
    description: "Ser responsável por um planejamento pela primeira vez.",
    rarity: "common",
    category: "planning",
  },
  cartografo: {
    name: "Cartógrafo",
    emoji: "🗺️",
    description: "Finalizar o primeiro mês de planejamento.",
    rarity: "rare",
    category: "planning",
    goal: { metric: "monthsFinalized", value: 1 },
  },
  "tudo-planejado": {
    name: "Tudo Planejado",
    emoji: "🧩",
    description: "Finalizar 12 meses de planejamento.",
    rarity: "epic",
    category: "planning",
    goal: { metric: "monthsFinalized", value: 12 },
  },
  "grande-mestre": {
    name: "Grande Mestre",
    emoji: "♟️",
    description: "Finalizar 48 meses de planejamento.",
    rarity: "legendary",
    category: "planning",
    goal: { metric: "monthsFinalized", value: 48 },
  },
  "visao-de-futuro": {
    name: "Visão de Futuro",
    emoji: "🔮",
    description: "Ter posts cadastrados num mês 2 meses ou mais antes de ele começar.",
    rarity: "rare",
    category: "planning",
  },
  "o-arquiteto": {
    name: "O Arquiteto",
    emoji: "🏗️",
    description: "Ter um mês de planejamento com 10 posts ou mais.",
    rarity: "rare",
    category: "planning",
  },
  "mente-organizada": {
    name: "Mente Organizada",
    emoji: "📚",
    description: "Ser responsável por 3 planejamentos ao mesmo tempo.",
    rarity: "rare",
    category: "planning",
    goal: { metric: "planningsResponsible", value: 3 },
  },
  "ctrl-c-ctrl-v": {
    name: "Ctrl+C, Ctrl+V",
    emoji: "📋",
    description: "Importar posts com o \"Colar do Word\".",
    rarity: "common",
    category: "planning",
  },
  "aprovado-de-primeira": {
    name: "Aprovado de Primeira",
    emoji: "✅",
    description: "Um mês chegar a \"Aprovado\" sem ter passado por \"Ajustes pedidos\".",
    rarity: "rare",
    category: "planning",
  },
  "fechou-o-mes": {
    name: "Fechou o Mês",
    emoji: "🗓️",
    description: "Finalizar o mesmo mês em todos os planejamentos em que você é responsável (pelo menos 3).",
    rarity: "epic",
    category: "planning",
  },

  // Mensagens e chat (do chat e dos trabalhos somadas)
  "alo-som": {
    name: "Alô, Som!",
    emoji: "👋",
    description: "Enviar a primeira mensagem.",
    rarity: "common",
    category: "messages",
    goal: { metric: "messagesSent", value: 1 },
  },
  tagarela: {
    name: "Tagarela",
    emoji: "🗣️",
    description: "Enviar 100 mensagens.",
    rarity: "common",
    category: "messages",
    goal: { metric: "messagesSent", value: 100 },
  },
  "nao-para-de-falar": {
    name: "Não Para de Falar",
    emoji: "📢",
    description: "Enviar 1.000 mensagens.",
    rarity: "rare",
    category: "messages",
    goal: { metric: "messagesSent", value: 1_000 },
  },
  "escreveu-um-livro": {
    name: "Escreveu um Livro",
    emoji: "📖",
    description: "Enviar 10.000 mensagens.",
    rarity: "legendary",
    category: "messages",
    goal: { metric: "messagesSent", value: 10_000 },
  },
  "print-ou-nao-aconteceu": {
    name: "Print ou Não Aconteceu",
    emoji: "📸",
    description: "Colar uma imagem com Ctrl+V numa mensagem e enviar.",
    rarity: "common",
    category: "messages",
  },
  "ta-na-rede": {
    name: "Tá na Rede!",
    emoji: "📁",
    description: "Mandar um caminho de pasta do drive (G:\\...).",
    rarity: "common",
    category: "messages",
  },
  "o-link-ta-ai": {
    name: "O Link Tá Aí",
    emoji: "🔗",
    description: "Mandar 25 mensagens com link.",
    rarity: "rare",
    category: "messages",
    goal: { metric: "linkMessages", value: 25 },
  },
  "ei-voce": {
    name: "Ei, Você!",
    emoji: "👉",
    description: "Mencionar alguém com @ nas mensagens de um trabalho.",
    rarity: "common",
    category: "messages",
  },
  "puxando-assunto": {
    name: "Puxando Assunto",
    emoji: "💬",
    description: "Mandar a primeira mensagem de uma conversa nova no chat.",
    rarity: "common",
    category: "messages",
  },
  "sem-palavras": {
    name: "Sem Palavras",
    emoji: "😎",
    description: "Usar todas as reações (👍 ❤️ 😂 😮 🎉 ✅).",
    rarity: "common",
    category: "messages",
    goal: { metric: "reactionsUsed", value: 6 },
  },
  "importante-ta": {
    name: "Importante, Tá?",
    emoji: "📌",
    description: "Fixar uma mensagem.",
    rarity: "common",
    category: "messages",
  },
  "arqueologo-digital": {
    name: "Arqueólogo Digital",
    emoji: "🕵️",
    description: "Abrir, pela busca global, uma mensagem com mais de 6 meses.",
    rarity: "rare",
    category: "messages",
  },
  "eu-nao-disse-isso": {
    name: "Eu Não Disse Isso",
    emoji: "🙊",
    description: "Apagar uma mensagem que você mandou.",
    rarity: "common",
    category: "messages",
  },
  favoritismo: {
    name: "Favoritismo",
    emoji: "⭐",
    description: "Favoritar 10 mensagens.",
    rarity: "common",
    category: "messages",
    goal: { metric: "favorites", value: 10 },
  },
  festeiro: {
    name: "Festeiro",
    emoji: "🎉",
    description: "Usar os 4 comandos: /confetti, /flip, /coffee e /party.",
    rarity: "rare",
    category: "messages",
    goal: { metric: "commandsUsed", value: 4 },
  },
  popular: {
    name: "Popular",
    emoji: "🌟",
    description: "Receber 50 reações nas suas mensagens.",
    rarity: "rare",
    category: "messages",
    goal: { metric: "reactionsReceived", value: 50 },
  },
  requisitado: {
    name: "Requisitado",
    emoji: "🙋",
    description: "Ser mencionado 25 vezes.",
    rarity: "rare",
    category: "messages",
    goal: { metric: "mentionsReceived", value: 25 },
  },
  "pra-ninguem-esquecer": {
    name: "Pra Ninguém Esquecer",
    emoji: "🧷",
    description: "Ter uma mensagem sua fixada por outra pessoa.",
    rarity: "common",
    category: "messages",
  },
  coruja: {
    name: "Coruja",
    emoji: "🦉",
    description: "Mandar uma mensagem entre meia-noite e 5h.",
    rarity: "rare",
    category: "messages",
  },
  arquivista: {
    name: "Arquivista",
    emoji: "📎",
    description: "Enviar 50 anexos.",
    rarity: "rare",
    category: "messages",
    goal: { metric: "attachmentsSent", value: 50 },
  },

  // Uso do sistema
  "bem-vindo-a-bordo": {
    name: "Bem-vindo a Bordo",
    emoji: "🐣",
    description: "Entrar no Workboard pela primeira vez.",
    rarity: "common",
    category: "usage",
  },
  "identidade-confirmada": {
    name: "Identidade Confirmada",
    emoji: "🪪",
    description: "Colocar uma foto no perfil.",
    rarity: "common",
    category: "usage",
  },
  "anota-ai": {
    name: "Anota Aí",
    emoji: "🎈",
    description: "Cadastrar o próprio aniversário no perfil.",
    rarity: "common",
    category: "usage",
  },
  "dark-side": {
    name: "Dark Side",
    emoji: "🌙",
    description: "Ativar o tema escuro.",
    rarity: "common",
    category: "usage",
  },
  camaleao: {
    name: "Camaleão",
    emoji: "🎨",
    description: "Experimentar todas as 6 cores de destaque nas Configurações.",
    rarity: "rare",
    category: "usage",
    goal: { metric: "accentsTried", value: 6 },
  },
  "keyboard-warrior": {
    name: "Keyboard Warrior",
    emoji: "⌨️",
    description: "Abrir a busca pelo Ctrl+K 25 vezes.",
    rarity: "rare",
    category: "usage",
    goal: { metric: "searchShortcut", value: 25 },
  },
  "sherlock-holmes": {
    name: "Sherlock Holmes",
    emoji: "🔍",
    description: "Abrir 50 resultados diferentes pela busca global.",
    rarity: "rare",
    category: "usage",
    goal: { metric: "searchResultsOpened", value: 50 },
  },
  "paz-interior": {
    name: "Paz Interior",
    emoji: "🔔",
    description: "Zerar o sino tendo 10 ou mais notificações não lidas.",
    rarity: "common",
    category: "usage",
  },
  explorador: {
    name: "Explorador",
    emoji: "🧭",
    description: "Visitar todas as seções do menu que aparecem para você.",
    rarity: "rare",
    category: "usage",
    goal: { metric: "sectionsVisited" },
  },
  "silencio-por-favor": {
    name: "Silêncio, Por Favor",
    emoji: "🔇",
    description: "Desligar o som dos avisos nas Configurações.",
    rarity: "common",
    category: "usage",
  },

  // Quadros brancos
  "primeiro-rabisco": {
    name: "Primeiro Rabisco",
    emoji: "🖍️",
    description: "Criar o primeiro quadro.",
    rarity: "common",
    category: "boards",
  },
  "mural-da-equipe": {
    name: "Mural da Equipe",
    emoji: "🖼️",
    description: "Criar um quadro para toda a equipe.",
    rarity: "common",
    category: "boards",
  },
  "post-it-mania": {
    name: "Post-it Mania",
    emoji: "🟨",
    description: "Criar 50 post-its.",
    rarity: "rare",
    category: "boards",
    goal: { metric: "stickies", value: 50 },
  },
  brainstorm: {
    name: "Brainstorm",
    emoji: "🤝",
    description: "Estar num quadro ao mesmo tempo que mais 2 pessoas.",
    rarity: "rare",
    category: "boards",
  },

  // Secretas
  "isso-e-um-easter-egg": {
    name: "Isso É um Easter Egg?",
    emoji: "🥚",
    description: "Encontrar o primeiro segredo.",
    rarity: "epic",
    category: "secret",
    secret: true,
  },
  "old-school": {
    name: "Old School",
    emoji: "🕹️",
    description: "Digitar o código Konami (↑ ↑ ↓ ↓ ← → ← → B A) no Início.",
    rarity: "legendary",
    category: "secret",
    secret: true,
  },
  "o-que-voce-ta-procurando": {
    name: "O Que Você Tá Procurando?",
    emoji: "👀",
    description: "Clicar 10 vezes seguidas no logo da sidebar.",
    rarity: "epic",
    category: "secret",
    secret: true,
  },
  "quem-e-esse-pokemon": {
    name: "Quem É Esse Pokémon?",
    emoji: "🪞",
    description: "Abrir o próprio perfil 25 vezes.",
    rarity: "rare",
    category: "secret",
    secret: true,
    goal: { metric: "profileVisits", value: 25 },
  },
  "a-porta-estava-aberta": {
    name: "A Porta Estava Aberta",
    emoji: "🚪",
    description: "Achar a porta escondida na página de \"não encontrado\".",
    rarity: "epic",
    category: "secret",
    secret: true,
  },
  "voce-nao-deveria-estar-aqui": {
    name: "Você Não Deveria Estar Aqui",
    emoji: "🧙",
    description: "Assinar o livro de visitas da página secreta dos desenvolvedores.",
    rarity: "legendary",
    category: "secret",
    secret: true,
  },
  "alem-do-arco-iris": {
    name: "Além do Arco-Íris",
    emoji: "🌈",
    description: "Clicar nas cores de destaque na ordem do arco-íris e liberar a cor secreta.",
    rarity: "epic",
    category: "secret",
    secret: true,
  },
  "estraga-prazeres": {
    name: "Estraga-Prazeres",
    emoji: "🙅",
    description: "Desligar a comemoração das entregas nas Configurações.",
    rarity: "rare",
    category: "secret",
    secret: true,
  },
  "que-comando-e-esse": {
    name: "Que Comando É Esse?",
    emoji: "🤫",
    description: "Mandar o comando secreto do chat, que não aparece na lista do \"/\".",
    rarity: "epic",
    category: "secret",
    secret: true,
  },

  // Datas especiais
  "parabens-pra-voce": {
    name: "Parabéns Pra Você",
    emoji: "🎂",
    description: "Entrar no Workboard no próprio aniversário.",
    rarity: "rare",
    category: "dates",
  },
  "ja-e-de-casa": {
    name: "Já É de Casa",
    emoji: "🏠",
    description: "Completar 30 dias de cadastro.",
    rarity: "common",
    category: "dates",
    goal: { metric: "daysRegistered", value: 30, unit: "dias" },
  },
  "faz-parte-da-mobilia": {
    name: "Faz Parte da Mobília",
    emoji: "🪑",
    description: "Completar 1 ano de cadastro.",
    rarity: "epic",
    category: "dates",
    goal: { metric: "daysRegistered", value: 365, unit: "dias" },
  },
  dinossauro: {
    name: "Dinossauro",
    emoji: "🦖",
    description: "Completar 3 anos de cadastro.",
    rarity: "legendary",
    category: "dates",
    goal: { metric: "daysRegistered", value: 1_095, unit: "dias" },
  },
  "ho-ho-ho": {
    name: "Ho Ho Ho",
    emoji: "🎄",
    description: "Entrar no Workboard no Natal (25/12).",
    rarity: "rare",
    category: "dates",
  },
  "ano-novo-vida-nova": {
    name: "Ano Novo, Vida Nova",
    emoji: "🎆",
    description: "Entrar no Workboard em 1º de janeiro.",
    rarity: "rare",
    category: "dates",
  },
  carnaval: {
    name: "Ê, Carnaval",
    emoji: "🎭",
    description: "Entrar no Workboard na segunda ou na terça de Carnaval.",
    rarity: "rare",
    category: "dates",
  },
  "sexta-feira-13": {
    name: "Sexta-Feira 13",
    emoji: "🐈‍⬛",
    description: "Entrar no Workboard numa sexta-feira 13.",
    rarity: "common",
    category: "dates",
  },

  // Especiais
  "cacador-de-bugs": {
    name: "Caçador de Bugs",
    emoji: "🐛",
    description: "Encontrar um bug no Workboard. Um admin concede.",
    rarity: "epic",
    category: "special",
    manual: true,
  },
} as const satisfies Record<string, AchievementDefinition>;

export type AchievementId = keyof typeof ACHIEVEMENTS;
export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === "string" && Object.hasOwn(ACHIEVEMENTS, value);
}

export function achievementOf(id: AchievementId): AchievementDefinition {
  return ACHIEVEMENTS[id];
}

/** Desbloquear uma destas também desbloqueia a "Isso É um Easter Egg?". */
export const EASTER_EGG_ID: AchievementId = "isso-e-um-easter-egg";

/** As que a pessoa desbloqueia sozinha (sem as concedidas por admin): o total da tela. */
export const AUTOMATIC_ACHIEVEMENT_IDS = ACHIEVEMENT_IDS.filter((id) => !achievementOf(id).manual);

// Imagens: public/conquistas/<id>.png (ou .webp/.svg). O next.config lista a
// pasta no build e põe em ACHIEVEMENT_IMAGES; sem a imagem, aparece o emoji.
// Em dev, uma imagem nova só aparece depois de reiniciar o `npm run dev`.

const IMAGE_FILES = new Set((process.env.ACHIEVEMENT_IMAGES ?? "").split(",").filter(Boolean));
const IMAGE_EXTENSIONS = ["webp", "png", "svg"];

/** Caminho da imagem (`id` ou "secreta"), ou null se ainda não existe. */
export function achievementImage(name: AchievementId | "secreta"): string | null {
  for (const extension of IMAGE_EXTENSIONS) {
    const file = `${name}.${extension}`;
    if (IMAGE_FILES.has(file)) return `/conquistas/${file}`;
  }
  return null;
}

/** O que o banco guarda uma vez cada (achievement_record.kind). */
export const ACHIEVEMENT_RECORD_KINDS = [
  "job.completed",
  "planning.finalized",
  "accent",
  "nav",
  "search.result",
  "sticky",
] as const;
export type AchievementRecordKind = (typeof ACHIEVEMENT_RECORD_KINDS)[number];

/** Contadores (achievement_counter.key). */
export type AchievementCounterKey = "search.shortcut" | "profile.visit";

/** O que o navegador avisa (src/app/api/conquistas). O servidor confere o que dá para conferir. */
export type AchievementEvent =
  | { type: "theme.dark" }
  | { type: "accent"; accent: string }
  | { type: "sound.off" }
  | { type: "celebrate.off" }
  | { type: "search.shortcut" }
  | { type: "search.result"; key: string }
  | { type: "nav"; href: string }
  | { type: "profile.visit" }
  | { type: "konami" }
  | { type: "logo" }
  | { type: "door" }
  | { type: "rainbow" }
  | { type: "board.crowd"; boardId: string }
  | { type: "job.visit"; jobId: string };

/** Conquista desbloqueada pronta para o aviso na tela. */
export type UnlockedAchievement = { id: AchievementId; unlockedAt: string };

// Datas, no fuso da agência (o servidor roda em UTC).

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Dia ("AAAA-MM-DD") e hora em São Paulo. */
export function saoPauloClock(date: Date) {
  const values = Object.fromEntries(partsFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

function toUtc(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function fromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number) {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + delta);
  return fromUtc(date);
}

/** Dias de `from` até `to` (negativo se `to` vem antes). */
export function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** 0 = domingo ... 6 = sábado. */
export function weekdayOf(day: string) {
  return toUtc(day).getUTCDay();
}

export function isBusinessDay(day: string) {
  const weekday = weekdayOf(day);
  return weekday !== 0 && weekday !== 6;
}

/** Os `count` dias úteis que terminam em `day` (do mais recente para trás). Vazio se `day` não é dia útil. */
export function businessDaysEndingAt(day: string, count: number) {
  if (!isBusinessDay(day)) return [];
  const days = [day];
  let cursor = day;
  while (days.length < count) {
    cursor = addDays(cursor, -1);
    if (isBusinessDay(cursor)) days.push(cursor);
  }
  return days;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

/** Segunda e terça de Carnaval (48 e 47 dias antes da Páscoa). */
export function carnivalDays(year: number) {
  const easter = easterSunday(year);
  return [addDays(easter, -48), addDays(easter, -47)];
}
