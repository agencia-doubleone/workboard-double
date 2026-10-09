/** "Padaria São João (Centro)" -> "padaria-sao-joao-centro". Vazio vira "". */
export function slugify(text: string, maxLength = 60) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
}
