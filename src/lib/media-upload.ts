// Upload pelo navegador. Use em client components:
//
//   const item = await uploadMedia(file, { folder: "trabalhos", onProgress: setProgress });
//
// Erros esperados (tipo/tamanho, sessão, CDN fora do ar) chegam como
// MediaUploadError, com mensagem pronta para exibir. Cancelar pelo `signal`
// rejeita com AbortError.

import type { MediaFolder, MediaItem, MediaUploadTicket } from "@/lib/media";
import { signMediaSchema } from "@/lib/validations/media";

export class MediaUploadError extends Error {
  name = "MediaUploadError";
}

type UploadOptions = {
  folder?: MediaFolder;
  /** Fração enviada, de 0 a 1. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

export async function uploadMedia(
  file: File,
  { folder = "geral", onProgress, signal }: UploadOptions = {},
): Promise<MediaItem> {
  signal?.throwIfAborted();
  const request = signMediaSchema.safeParse({ name: file.name, size: file.size, folder });
  if (!request.success) {
    throw new MediaUploadError(request.error.issues[0]?.message ?? "Arquivo inválido.");
  }

  const ticket = await postJson<MediaUploadTicket>("/api/media/sign", request.data, signal);
  const receipt = await sendToCdn(ticket, file, onProgress, signal);
  return postJson<MediaItem>("/api/media/complete", { receipt }, signal);
}

type ErrorBody = { error?: unknown };

function errorMessage(body: unknown, fallback: string) {
  const error = (body as ErrorBody | null)?.error;
  return typeof error === "string" && error ? error : fallback;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MediaUploadError("Sem conexão com o servidor. Tente de novo.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new MediaUploadError(errorMessage(data, "Não foi possível enviar o arquivo."));
  return data as T;
}

/** XMLHttpRequest em vez de fetch: só ele informa o progresso do envio. */
function sendToCdn(
  ticket: MediaUploadTicket,
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const settle = () => signal?.removeEventListener("abort", abort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      settle();
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      const receipt = (data as { receipt?: unknown } | null)?.receipt;
      if (xhr.status >= 200 && xhr.status < 300 && typeof receipt === "string") {
        onProgress?.(1);
        resolve(receipt);
        return;
      }
      reject(new MediaUploadError(errorMessage(data, `O servidor de arquivos recusou o envio (${xhr.status}).`)));
    };
    xhr.onerror = () => {
      settle();
      reject(new MediaUploadError("Não foi possível falar com o servidor de arquivos."));
    };
    xhr.onabort = () => {
      settle();
      reject(new DOMException("Envio cancelado.", "AbortError"));
    };

    const form = new FormData();
    form.append("token", ticket.token);
    form.append("file", file);
    xhr.open("POST", ticket.uploadUrl);
    xhr.send(form);
  });
}
