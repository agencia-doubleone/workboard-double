// Prepara a foto de perfil no navegador antes do upload: recorta o centro em
// quadrado e reduz para no máximo 512 px (WebP; JPEG onde o navegador não
// gera WebP, como o Safari). Uma foto de celular de 5 MB vira ~40 KB.

import { MediaUploadError } from "@/lib/media-upload";

export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const AVATAR_SIZE = 512;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareAvatar(file: File): Promise<File> {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
    throw new MediaUploadError("Escolha uma imagem JPG, PNG, WebP, GIF ou AVIF.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new MediaUploadError("Imagem grande demais: o limite é 20 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaUploadError("Não foi possível ler esta imagem.");
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new MediaUploadError("Seu navegador não conseguiu processar a imagem.");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  let blob = await canvasToBlob(canvas, "image/webp", 0.9);
  if (blob?.type !== "image/webp") {
    // JPEG não tem transparência: fundo branco no lugar do preto.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size, size);
    blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
  }
  if (!blob) throw new MediaUploadError("Seu navegador não conseguiu processar a imagem.");

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `foto-de-perfil.${extension}`, { type: blob.type });
}
