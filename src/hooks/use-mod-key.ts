"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Tecla modificadora para exibir em atalhos: ⌘ no Mac, Ctrl no resto. */
export function useModKey() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
