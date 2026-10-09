import { randomInt } from "node:crypto";

import type { MediaExtension, MediaFolder } from "@/lib/media";

// Caminho do arquivo dentro de uploads/ no CDN:
//   trabalhos/2026/10/k3j9x0q2m8w1a7zc-briefing-cliente.pdf
// O trecho aleatório (16 caracteres, ~82 bits) é o que torna o link público
// impossível de adivinhar; o nome legível ajuda quem baixa. Sem "server-only":
// também é usado pelo scripts/check-cdn.ts.

const RANDOM_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const RANDOM_LENGTH = 16;
const SLUG_MAX_LENGTH = 60;

/** Mesmo padrão validado pelo cdn/lib.php. */
export const MEDIA_KEY_PATTERN =
  /^[a-z0-9-]+\/\d{4}\/\d{2}\/[a-z0-9]{16}-[a-z0-9-]{1,60}\.[a-z0-9]{2,5}$/;

const yearMonth = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function randomId() {
  let id = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) id += RANDOM_ALPHABET[randomInt(RANDOM_ALPHABET.length)];
  return id;
}

/** "Briefing Cliente (v2).PDF" -> "briefing-cliente-v2" */
export function slugifyFileName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const slug = base
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug || "arquivo";
}

export function buildMediaKey({
  folder,
  fileName,
  extension,
  now = new Date(),
}: {
  folder: MediaFolder;
  fileName: string;
  extension: MediaExtension;
  now?: Date;
}) {
  const parts = Object.fromEntries(yearMonth.formatToParts(now).map((part) => [part.type, part.value]));
  return `${folder}/${parts.year}/${parts.month}/${randomId()}-${slugifyFileName(fileName)}.${extension}`;
}
