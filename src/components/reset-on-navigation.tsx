"use client";

import { useRouter } from "next/navigation";
import { Fragment } from "react";

/**
 * Recomeça o conteúdo (um formulário de página) a cada navegação nova.
 *
 * Com cacheComponents, o Next não desmonta a página ao sair: guarda escondida
 * (<Activity>) com todo o estado, e ao voltar ela reaparece como estava. Num
 * formulário isso deixa os dados do último cadastro em "Novo" e valores velhos
 * em "Editar". O bfcacheId muda a cada navegação por link ou router.push/replace
 * e fica igual no voltar/avançar do navegador: o formulário começa limpo (com os
 * dados atuais do servidor) quando a pessoa clica para abrir, e o rascunho só
 * volta se ela usar o botão de voltar.
 */
export function ResetOnNavigation({ children }: { children: React.ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
