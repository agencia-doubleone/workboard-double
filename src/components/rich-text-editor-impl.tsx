"use client";

import FileHandler from "@tiptap/extension-file-handler";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BaselineIcon,
  BoldIcon,
  HighlighterIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  QuoteIcon,
  Redo2Icon,
  RemoveFormattingIcon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useModKey } from "@/hooks/use-mod-key";
import { cn } from "@/lib/utils";

// Implementação do editor (Tiptap). Não importe direto: use <RichTextEditor>
// de ./rich-text-editor, que carrega este arquivo só no navegador (o Tiptap
// sorteia ids na renderização e é pesado para o bundle inicial).
//
// Formatação: títulos, fonte, tamanho, negrito/itálico/sublinhado/riscado,
// cor, marca-texto, alinhamento, listas, citação, links e imagens (coladas,
// arrastadas ou pelo botão, enviadas ao CDN por onUploadImage). Ao colar de
// fora, a formatação externa (estilos, fontes, imagens de outros sites) é
// descartada; copiar e colar dentro do próprio editor mantém tudo.

export type RichTextEditorProps = {
  id?: string;
  /** HTML inicial. Mudanças externas depois de montado não são aplicadas. */
  value: string;
  /** HTML atual, ou "" quando o editor está vazio. */
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-labelledby"?: string;
  /**
   * Envia uma imagem e devolve a URL pública. Sem ele, o editor não aceita
   * imagens. Passe uma função estável (fora do componente ou com useCallback):
   * trocar a função recria o editor.
   */
  onUploadImage?: (file: File) => Promise<string>;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const FONT_FAMILIES = [
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"];
const DEFAULT = "padrao";

// Cores em tom médio: legíveis no tema claro e no escuro.
const TEXT_COLORS = [
  { value: "#dc2626", label: "Vermelho" },
  { value: "#ea580c", label: "Laranja" },
  { value: "#ca8a04", label: "Amarelo" },
  { value: "#16a34a", label: "Verde" },
  { value: "#0d9488", label: "Turquesa" },
  { value: "#2563eb", label: "Azul" },
  { value: "#7c3aed", label: "Roxo" },
  { value: "#db2777", label: "Rosa" },
  { value: "#6b7280", label: "Cinza" },
];
// Marca-texto translúcido: o texto continua na cor normal nos dois temas.
const HIGHLIGHTS = [
  { value: "rgba(250, 204, 21, 0.4)", label: "Amarelo" },
  { value: "rgba(34, 197, 94, 0.3)", label: "Verde" },
  { value: "rgba(59, 130, 246, 0.3)", label: "Azul" },
  { value: "rgba(236, 72, 153, 0.3)", label: "Rosa" },
  { value: "rgba(249, 115, 22, 0.35)", label: "Laranja" },
  { value: "rgba(139, 92, 246, 0.3)", label: "Roxo" },
];

/**
 * Tira a formatação externa do HTML colado (mas não a de dentro do próprio
 * editor). Imagens https de outros sites ficam, apontando para a origem; as
 * demais (data:, http:) saem.
 */
function cleanPastedHtml(html: string) {
  if (html.includes("data-pm-slice")) return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("style, script, meta, link, font").forEach((node) => {
    if (node.tagName === "FONT") node.replaceWith(...node.childNodes);
    else node.remove();
  });
  document.querySelectorAll("img").forEach((image) => {
    if (!HTTPS_URL.test(image.getAttribute("src") ?? "")) {
      image.remove();
      return;
    }
    for (const { name } of [...image.attributes]) {
      if (name !== "src" && name !== "alt") image.removeAttribute(name);
    }
  });
  document.querySelectorAll("[style], [class], [color], [face], [size]").forEach((node) => {
    for (const attribute of ["style", "class", "color", "face", "size"]) node.removeAttribute(attribute);
  });
  return document.body.innerHTML;
}

const HTTPS_URL = /^https:\/\/\S+$/i;

const sameFont = (a: string | undefined, b: string) => a?.replace(/["']/g, "") === b.replace(/["']/g, "");

export default function RichTextEditorImpl({
  id,
  value,
  onChange,
  placeholder = "Escreva aqui...",
  disabled,
  invalid,
  "aria-labelledby": labelledBy,
  onUploadImage,
}: RichTextEditorProps) {
  const [uploading, setUploading] = useState(0);

  async function insertImages(editor: Editor, files: File[], position?: number) {
    const upload = onUploadImage;
    if (!upload) return;
    for (const file of files) {
      setUploading((count) => count + 1);
      try {
        const src = await upload(file);
        const at = position ?? editor.state.selection.to;
        editor.chain().focus().insertContentAt(at, { type: "image", attrs: { src, alt: "" } }).run();
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : "Não foi possível enviar a imagem.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  const editor = useEditor({
    // Renderiza só no navegador: evita divergência na hidratação.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({
        resize: {
          enabled: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          minWidth: 80,
          alwaysPreserveAspectRatio: true,
        },
      }),
      FileHandler.configure({
        allowedMimeTypes: IMAGE_TYPES,
        onPaste: (current, files) => void insertImages(current, files),
        onDrop: (current, files, position) => void insertImages(current, files, position),
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        "aria-multiline": "true",
        role: "textbox",
        class: "rich-text min-h-48 px-3 py-2.5 outline-none",
      },
      transformPastedHTML: cleanPastedHtml,
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  }, [onUploadImage]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      aria-invalid={invalid}
      className={cn(
        "overflow-hidden rounded-md border border-input bg-background shadow-control transition-[color,border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Toolbar
        editor={editor}
        uploading={uploading > 0}
        onPickImages={onUploadImage && editor ? (files) => void insertImages(editor, files) : undefined}
      />
      <EditorContent editor={editor} className="max-h-[36rem] overflow-y-auto" />
    </div>
  );
}

function Toolbar({
  editor,
  uploading,
  onPickImages,
}: {
  editor: Editor | null;
  uploading: boolean;
  onPickImages?: (files: File[]) => void;
}) {
  const modKey = useModKey();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const textStyle = current.getAttributes("textStyle");
      return {
        h2: current.isActive("heading", { level: 2 }),
        h3: current.isActive("heading", { level: 3 }),
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        link: current.isActive("link"),
        align: (["center", "right", "justify"] as const).find((align) => current.isActive({ textAlign: align })) ?? "left",
        fontFamily: (textStyle.fontFamily as string | undefined) ?? undefined,
        fontSize: (textStyle.fontSize as string | undefined) ?? undefined,
        color: (textStyle.color as string | undefined) ?? undefined,
        highlight: (current.getAttributes("highlight").color as string | undefined) ?? undefined,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });
  const ready = Boolean(editor && state);
  const chain = () => editor!.chain().focus();
  const fontFamily = FONT_FAMILIES.find((font) => sameFont(state?.fontFamily, font.value))?.value ?? DEFAULT;
  const fontSize = state?.fontSize && FONT_SIZES.includes(state.fontSize) ? state.fontSize : DEFAULT;

  return (
    <div
      role="toolbar"
      aria-label="Formatação"
      className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1 dark:bg-transparent"
    >
      <ToolbarButton label="Desfazer" shortcut={[modKey, "Z"]} disabled={!state?.canUndo} onClick={() => chain().undo().run()}>
        <Undo2Icon />
      </ToolbarButton>
      <ToolbarButton label="Refazer" shortcut={[modKey, "Shift", "Z"]} disabled={!state?.canRedo} onClick={() => chain().redo().run()}>
        <Redo2Icon />
      </ToolbarButton>
      <ToolbarDivider />

      <ToolbarSelect
        label="Fonte"
        value={fontFamily}
        items={{ [DEFAULT]: "Fonte padrão", ...Object.fromEntries(FONT_FAMILIES.map((font) => [font.value, font.label])) }}
        disabled={!ready}
        className="w-36"
        onChange={(next) => (next === DEFAULT ? chain().unsetFontFamily().run() : chain().setFontFamily(next).run())}
        renderItem={(item, label) => (
          <span style={item === DEFAULT ? undefined : { fontFamily: item }}>{label}</span>
        )}
      />
      <ToolbarSelect
        label="Tamanho"
        value={fontSize}
        items={{ [DEFAULT]: "Tamanho", ...Object.fromEntries(FONT_SIZES.map((size) => [size, size.replace("px", "")])) }}
        disabled={!ready}
        className="w-24"
        onChange={(next) => (next === DEFAULT ? chain().unsetFontSize().run() : chain().setFontSize(next).run())}
      />
      <ToolbarDivider />

      <ToolbarButton label="Título" active={state?.h2} disabled={!ready} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2Icon />
      </ToolbarButton>
      <ToolbarButton label="Subtítulo" active={state?.h3} disabled={!ready} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3Icon />
      </ToolbarButton>
      <ToolbarDivider />

      <ToolbarButton label="Negrito" shortcut={[modKey, "B"]} active={state?.bold} disabled={!ready} onClick={() => chain().toggleBold().run()}>
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton label="Itálico" shortcut={[modKey, "I"]} active={state?.italic} disabled={!ready} onClick={() => chain().toggleItalic().run()}>
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton label="Sublinhado" shortcut={[modKey, "U"]} active={state?.underline} disabled={!ready} onClick={() => chain().toggleUnderline().run()}>
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton label="Riscado" active={state?.strike} disabled={!ready} onClick={() => chain().toggleStrike().run()}>
        <StrikethroughIcon />
      </ToolbarButton>
      <ColorButton
        label="Cor do texto"
        icon={<BaselineIcon />}
        current={state?.color}
        colors={TEXT_COLORS}
        resetLabel="Cor automática"
        customLabel="Cor personalizada"
        disabled={!ready}
        onPick={(color) => (color ? chain().setColor(color).run() : chain().unsetColor().run())}
      />
      <ColorButton
        label="Marca-texto"
        icon={<HighlighterIcon />}
        current={state?.highlight}
        colors={HIGHLIGHTS}
        resetLabel="Sem marca-texto"
        customLabel="Marca-texto personalizado"
        // Transparência (40%) para o texto continuar legível nos dois temas.
        customAlpha="66"
        disabled={!ready}
        onPick={(color) => (color ? chain().setHighlight({ color }).run() : chain().unsetHighlight().run())}
      />
      <ToolbarDivider />

      <ToolbarButton label="Alinhar à esquerda" active={ready && state?.align === "left"} disabled={!ready} onClick={() => chain().setTextAlign("left").run()}>
        <AlignLeftIcon />
      </ToolbarButton>
      <ToolbarButton label="Centralizar" active={state?.align === "center"} disabled={!ready} onClick={() => chain().setTextAlign("center").run()}>
        <AlignCenterIcon />
      </ToolbarButton>
      <ToolbarButton label="Alinhar à direita" active={state?.align === "right"} disabled={!ready} onClick={() => chain().setTextAlign("right").run()}>
        <AlignRightIcon />
      </ToolbarButton>
      <ToolbarButton label="Justificar" active={state?.align === "justify"} disabled={!ready} onClick={() => chain().setTextAlign("justify").run()}>
        <AlignJustifyIcon />
      </ToolbarButton>
      <ToolbarDivider />

      <ToolbarButton label="Lista" active={state?.bulletList} disabled={!ready} onClick={() => chain().toggleBulletList().run()}>
        <ListIcon />
      </ToolbarButton>
      <ToolbarButton label="Lista numerada" active={state?.orderedList} disabled={!ready} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrderedIcon />
      </ToolbarButton>
      <ToolbarButton label="Citação" active={state?.blockquote} disabled={!ready} onClick={() => chain().toggleBlockquote().run()}>
        <QuoteIcon />
      </ToolbarButton>
      <ToolbarDivider />

      <LinkButton editor={editor} active={state?.link} disabled={!ready} />
      <ImageButton editor={editor} disabled={!ready} uploading={uploading} onPickImages={onPickImages} />
      <ToolbarDivider />

      <ToolbarButton label="Limpar formatação" disabled={!ready} onClick={() => chain().unsetAllMarks().clearNodes().unsetTextAlign().run()}>
        <RemoveFormattingIcon />
      </ToolbarButton>
    </div>
  );
}

/**
 * Formulários dos popovers (cor, link, imagem): o popover fica num portal,
 * fora do <form> da página no DOM, mas no React o submit sobe pela árvore de
 * componentes e chegaria ao formulário de quem usa o editor (ex.: salvaria o
 * cliente). Por isso o envio para aqui.
 */
function stopSubmit(event: React.FormEvent) {
  event.preventDefault();
  event.stopPropagation();
}

const toolbarButtonClass =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-primary-soft aria-pressed:text-primary-ink data-popup-open:bg-muted data-popup-open:text-foreground [&_svg]:size-4";

function ToolbarButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string[];
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Hint label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active ?? false}
        disabled={disabled}
        // Mantém a seleção do texto ao clicar no botão.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        className={toolbarButtonClass}
      >
        {children}
      </button>
    </Hint>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />;
}

function ToolbarSelect({
  label,
  value,
  items,
  onChange,
  disabled,
  className,
  renderItem,
}: {
  label: string;
  value: string;
  items: Record<string, string>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  renderItem?: (value: string, label: string) => React.ReactNode;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => next !== null && onChange(next)} disabled={disabled}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        className={cn("h-7 border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-muted dark:bg-transparent", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="max-h-72">
        {Object.entries(items).map(([item, itemLabel]) => (
          <SelectItem key={item} value={item}>
            {renderItem ? renderItem(item, itemLabel) : itemLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function ColorButton({
  label,
  icon,
  current,
  colors,
  resetLabel,
  customLabel,
  customAlpha = "",
  disabled,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  current?: string;
  colors: { value: string; label: string }[];
  resetLabel: string;
  customLabel: string;
  /** Sufixo de transparência em hex (ex.: "66" = 40%) aplicado à cor personalizada. */
  customAlpha?: string;
  disabled?: boolean;
  onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("#2563eb");
  const customValid = HEX_COLOR.test(custom);

  function handleOpenChange(next: boolean) {
    // Abre já com a cor atual, se for uma personalizada (hex).
    if (next && current && /^#[0-9a-f]{6}/i.test(current)) setCustom(current.slice(0, 7));
    setOpen(next);
  }

  function pick(color: string | null) {
    onPick(color);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Hint label={label}>
        <PopoverTrigger
          aria-label={label}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          className={cn(toolbarButtonClass, "relative")}
        >
          {icon}
          {/* Faixa com a cor atual, sob o ícone. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full"
            style={{ backgroundColor: current ?? "transparent" }}
          />
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="start" className="w-auto gap-2 p-2" initialFocus={false}>
        <div className="grid grid-cols-6 gap-1">
          {colors.map((color) => (
            <Hint key={color.value} label={color.label}>
              <button
                type="button"
                aria-label={color.label}
                aria-pressed={current === color.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(color.value)}
                className="flex size-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-muted"
              >
                <span className="size-4 rounded-full ring-1 ring-foreground/10 ring-inset" style={{ backgroundColor: color.value }} />
              </button>
            </Hint>
          ))}
        </div>
        <form
          className="flex flex-col gap-1.5 border-t pt-2"
          onSubmit={(event) => {
            stopSubmit(event);
            if (customValid) pick(`${custom}${customAlpha}`);
          }}
        >
          <span className="text-xs font-medium text-muted-foreground">{customLabel}</span>
          <div className="flex items-center gap-1.5">
            <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-control">
              <span className="absolute inset-0" style={{ backgroundColor: customValid ? custom : "transparent" }} />
              <input
                type="color"
                value={customValid ? custom : "#000000"}
                onChange={(event) => setCustom(event.target.value)}
                aria-label={`${customLabel}: escolher`}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
            <Input
              value={custom}
              onChange={(event) => setCustom(event.target.value.trim())}
              maxLength={7}
              spellCheck={false}
              aria-label={`${customLabel} em hex`}
              aria-invalid={!customValid}
              className="h-8 w-24 font-mono text-xs"
            />
            <Button type="submit" size="sm" disabled={!customValid}>
              Aplicar
            </Button>
          </div>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(null)}
        >
          {resetLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Imagem: enviar do computador (se houver upload) ou inserir pelo link de outro site. */
function ImageButton({
  editor,
  disabled,
  uploading,
  onPickImages,
}: {
  editor: Editor | null;
  disabled?: boolean;
  uploading: boolean;
  onPickImages?: (files: File[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const urlValid = HTTPS_URL.test(url.trim());

  function insertByUrl(event: React.FormEvent) {
    stopSubmit(event);
    if (!editor || !urlValid) return;
    editor.chain().focus().setImage({ src: url.trim(), alt: "" }).run();
    setUrl("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={uploading ? "Enviando imagem..." : "Imagem (também dá para colar ou arrastar)"}>
        <PopoverTrigger
          aria-label="Imagem"
          disabled={disabled || uploading}
          onMouseDown={(event) => event.preventDefault()}
          className={toolbarButtonClass}
        >
          {uploading ? <Loader2Icon className="animate-spin" /> : <ImageIcon />}
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="start" className="w-80 gap-3">
        {onPickImages && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                fileRef.current?.click();
              }}
            >
              <ImageIcon data-icon="inline-start" />
              Enviar do computador
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length) onPickImages(files);
              }}
            />
          </>
        )}
        <form onSubmit={insertByUrl} className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Inserir pelo link</span>
          <Input
            autoFocus={!onPickImages}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://site.com/imagem.png"
            aria-label="Link da imagem"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            A imagem continua no site de origem: se ela sair de lá, some daqui também.
          </p>
          <Button type="submit" size="sm" disabled={!urlValid} className="self-end">
            Inserir
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function LinkButton({ editor, active, disabled }: { editor: Editor | null; active?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");

  function handleOpenChange(next: boolean) {
    if (next && editor) setHref(editor.getAttributes("link").href ?? "");
    setOpen(next);
  }

  function apply(event: React.FormEvent) {
    stopSubmit(event);
    if (!editor) return;
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}` }).run();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Hint label="Link">
        <PopoverTrigger
          aria-label="Link"
          aria-pressed={active ?? false}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          className={toolbarButtonClass}
        >
          <LinkIcon />
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={apply} className="flex flex-col gap-2">
          <Input
            autoFocus
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://..."
            aria-label="Endereço do link"
          />
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Remover link
              </Button>
            )}
            <Button type="submit" size="sm">
              Aplicar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
