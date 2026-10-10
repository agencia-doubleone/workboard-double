// Formas serializáveis que a página de arquivos entrega aos client components.

import type { MediaFolder } from "@/lib/media";

/** unregistered: está no servidor, mas o Workboard não tem registro dele. */
export type FileUsage = "used" | "unused" | "recent" | "unregistered";

export type FileUseView = { label: string; href: string | null };

export type FileView = {
  /** media.id, ou "cdn:<chave>" para quem não tem registro. */
  id: string;
  key: string;
  /** Tem linha em `media` (sem registro, sai pela chave). */
  registered: boolean;
  /** Registrado, mas o arquivo não está no servidor (link quebrado). */
  missing: boolean;
  /** Anexos do chat e imagens de quadros pessoais são privados: nome, prévia e link não aparecem. */
  private: boolean;
  name: string;
  extension: string;
  /** Link público do arquivo (null quando privado ou sumido). */
  url: string | null;
  /** Miniatura (só imagens que o navegador abre). */
  thumbUrl: string | null;
  folder: MediaFolder;
  folderLabel: string;
  size: string;
  uploadedBy: string | null;
  createdAt: { label: string; absolute: string };
  usage: FileUsage;
  uses: FileUseView[];
};

export type FilesSummary = {
  total: { count: number; size: string };
  used: { count: number; size: string };
  /** Esquecidos: sem uso há mais de 24 h, inclusive os sem registro. */
  unused: { count: number; size: string; unregistered: number };
  recent: { count: number };
  /** Registros cujo arquivo não está no servidor. */
  missing: number;
};

/** Situação da lista do servidor (list.php). */
export type CdnListingStatus = "ok" | "truncated" | "not-installed" | "failed" | "not-configured";
