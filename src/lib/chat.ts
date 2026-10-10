// Regras do chat compartilhadas entre servidor e navegador.

/** Mensagens que a conversa carrega de cada vez (e em "Carregar mensagens anteriores"). */
export const CHAT_PAGE_SIZE = 50;

/** O sinal de "digitando…" sai no máximo a cada intervalo destes enquanto a pessoa escreve. */
export const TYPING_SIGNAL_MS = 2_500;

/** Altura da tela do chat: a janela menos o header (48 px) e o respiro do painel. */
export const CHAT_SCREEN_HEIGHT = "h-[calc(100svh-6rem)] md:h-[calc(100svh-8.125rem)]";
