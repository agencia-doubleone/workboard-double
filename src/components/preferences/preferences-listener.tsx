"use client";

import { usePreferences } from "./preferences-store";

/**
 * Mantém o store inscrito em qualquer página (inclusive no login), para
 * acompanhar a troca de tema do sistema e mudanças feitas em outras abas.
 */
export function PreferencesListener() {
  usePreferences();
  return null;
}
