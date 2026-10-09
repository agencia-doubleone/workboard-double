import sanitizeHtml from "sanitize-html";

// Limpa o HTML do editor (Tiptap) antes de salvar: só as tags e os estilos que
// o editor produz, links só http(s)/mailto/tel (sempre em nova aba) e imagens
// só https (do nosso CDN ou de outros sites; data: e http: saem). O que for
// salvo é exibido com dangerouslySetInnerHTML, então passe tudo por aqui.

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|inherit)$/i;
const FONT_SIZE = /^\d{1,2}(\.\d+)?px$/;
const FONT_FAMILY = /^[\w\s,"'-]{1,80}$/;
const TEXT_ALIGN = /^(left|center|right|justify)$/;
const DIGITS = /^\d{1,4}$/;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "blockquote", "a", "hr", "code", "pre",
    "span", "mark", "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    span: ["style"],
    mark: ["style", "data-color"],
    p: ["style"],
    h2: ["style"],
    h3: ["style"],
  },
  allowedStyles: {
    span: { color: [COLOR], "background-color": [COLOR], "font-size": [FONT_SIZE], "font-family": [FONT_FAMILY] },
    mark: { color: [COLOR], "background-color": [COLOR] },
    p: { "text-align": [TEXT_ALIGN] },
    h2: { "text-align": [TEXT_ALIGN] },
    h3: { "text-align": [TEXT_ALIGN] },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    // O editor só tem títulos h2/h3; um h1 colado vira h2 em vez de perder a tag.
    h1: "h2",
    // Largura e altura (do redimensionamento) só como número.
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        src: attribs.src ?? "",
        alt: attribs.alt ?? "",
        ...(DIGITS.test(attribs.width ?? "") ? { width: attribs.width } : {}),
        ...(DIGITS.test(attribs.height ?? "") ? { height: attribs.height } : {}),
      },
    }),
  },
  // Imagem sem src https (data:, http:, relativa) sai inteira.
  exclusiveFilter: (frame) => frame.tag === "img" && !/^https:\/\//i.test(frame.attribs.src ?? ""),
};

/** HTML seguro, ou null quando não sobra conteúdo (ex.: só "<p></p>"). */
export function sanitizeRichText(html: string) {
  const clean = sanitizeHtml(html, OPTIONS).trim();
  const text = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim();
  return text || clean.includes("<img") ? clean : null;
}

/** Texto puro e curto, para a auditoria (nunca o HTML inteiro). */
export function richTextExcerpt(html: string | null, maxLength = 120) {
  if (!html) return null;
  const text = sanitizeHtml(html.replace(/<\/(p|h2|h3|li|blockquote)>/g, " "), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return html.includes("<img") ? "(imagem)" : null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
