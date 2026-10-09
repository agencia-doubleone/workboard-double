// Regras de upload compartilhadas entre servidor e navegador (sem segredos).
// O cdn/lib.php repete a lista de extensões: mantenha os dois em sincronia.

export const MEDIA_KINDS = {
  image: { label: "Imagens", maxSize: 25 * 1024 * 1024 },
  document: { label: "Documentos", maxSize: 50 * 1024 * 1024 },
  video: { label: "Vídeo e áudio", maxSize: 500 * 1024 * 1024 },
  design: { label: "Compactados e design", maxSize: 500 * 1024 * 1024 },
} as const;
export type MediaKind = keyof typeof MEDIA_KINDS;

/** Extensões aceitas. O tipo (MIME) gravado vem daqui, não do navegador. */
export const MEDIA_TYPES = {
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  png: { mime: "image/png", kind: "image" },
  webp: { mime: "image/webp", kind: "image" },
  gif: { mime: "image/gif", kind: "image" },
  avif: { mime: "image/avif", kind: "image" },

  pdf: { mime: "application/pdf", kind: "document" },
  doc: { mime: "application/msword", kind: "document" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document" },
  xls: { mime: "application/vnd.ms-excel", kind: "document" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document" },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "document" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "document" },
  txt: { mime: "text/plain", kind: "document" },
  csv: { mime: "text/csv", kind: "document" },

  mp4: { mime: "video/mp4", kind: "video" },
  mov: { mime: "video/quicktime", kind: "video" },
  webm: { mime: "video/webm", kind: "video" },
  mp3: { mime: "audio/mpeg", kind: "video" },
  wav: { mime: "audio/wav", kind: "video" },
  m4a: { mime: "audio/mp4", kind: "video" },

  zip: { mime: "application/zip", kind: "design" },
  rar: { mime: "application/vnd.rar", kind: "design" },
  "7z": { mime: "application/x-7z-compressed", kind: "design" },
  psd: { mime: "image/vnd.adobe.photoshop", kind: "design" },
  ai: { mime: "application/postscript", kind: "design" },
  eps: { mime: "application/postscript", kind: "design" },
} as const satisfies Record<string, { mime: string; kind: MediaKind }>;
export type MediaExtension = keyof typeof MEDIA_TYPES;

/** Primeiro nível de pasta no CDN. Novas áreas do sistema entram aqui. */
export const MEDIA_FOLDERS = ["geral", "trabalhos", "clientes"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export const MEDIA_NAME_MAX_LENGTH = 200;

export function getFileExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export function getMediaType(fileName: string) {
  const extension = getFileExtension(fileName);
  return extension in MEDIA_TYPES
    ? { extension: extension as MediaExtension, ...MEDIA_TYPES[extension as MediaExtension] }
    : null;
}

/** Para o atributo accept do <input type="file">. */
export const MEDIA_ACCEPT = Object.keys(MEDIA_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** O que /api/media/sign devolve. */
export type MediaUploadTicket = {
  /** Para onde o navegador envia o arquivo (POST multipart: token + file). */
  uploadUrl: string;
  token: string;
  key: string;
  expiresAt: string;
};

/** Arquivo registrado, como /api/media/complete devolve. */
export type MediaItem = {
  id: string;
  key: string;
  url: string;
  name: string;
  type: string;
  size: number;
  folder: MediaFolder;
  createdAt: string;
};
