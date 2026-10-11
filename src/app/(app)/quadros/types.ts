import type { WhiteboardAccess } from "@/lib/whiteboards";

export type WhiteboardPersonView = { id: string; name: string; imageUrl: string | null };

export type WhiteboardJobOption = { id: string; pit: number; name: string };

/** Um quadro na lista (e na página do trabalho). */
export type WhiteboardCardView = {
  id: string;
  title: string;
  access: WhiteboardAccess;
  owner: WhiteboardPersonView | null;
  job: { pit: number; name: string } | null;
  members: WhiteboardPersonView[];
  /** Miniatura (rota com cache; muda de endereço quando a miniatura muda). */
  previewUrl: string | null;
  updated: { label: string; absolute: string };
  updatedBy: string | null;
  /** Quem vê pode excluir (o dono; nos coletivos, também os admins). */
  canDelete: boolean;
};

/** O que o formulário de criar/editar edita. */
export type WhiteboardFormValues = {
  whiteboardId?: string;
  title: string;
  access: WhiteboardAccess;
  memberIds: string[];
  jobId: string | null;
};
