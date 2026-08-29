"use client";

import { useTranslations } from "next-intl";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  BulletListIcon,
  HighlightIcon,
  ItalicIcon,
  LineSpacingIcon,
  NumberListIcon,
  TextColorIcon,
  UnderlineIcon,
} from "@/components/icons";
import { Select } from "@/components/select";
import { NumberInput } from "@/components/number-input";
import type { DocumentBlock, RichText, TextAlign } from "@/types/template";

const FONT_FAMILIES = [
  { value: "", label: "Inter (default)" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "'Courier New', monospace", label: "Courier New" },
];

const LINE_SPACINGS = [1, 1.15, 1.5, 2];

function hasContent(block: DocumentBlock | null): block is DocumentBlock & { content: RichText } {
  return !!block && (block.type === "heading" || block.type === "paragraph");
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function preventBlur(e: React.MouseEvent) {
  e.preventDefault();
}

interface EditorFormatToolbarProps {
  selectedBlock: DocumentBlock | null;
  onUpdateBlock: (patch: Partial<DocumentBlock>) => void;
  disabled: boolean;
}

/** Contextual formatting toolbar for the currently selected text block. Bold/Italic/Underline/
 * colors use the browser's own `document.execCommand` on the focused contentEditable (buttons use
 * `onMouseDown` + preventDefault so clicking them never steals focus/selection away from it);
 * alignment/list/spacing are block-level fields updated directly. */
export function EditorFormatToolbar({ selectedBlock, onUpdateBlock, disabled }: EditorFormatToolbarProps) {
  const t = useTranslations("templates.format");
  const active = !disabled && hasContent(selectedBlock);
  const content = active ? selectedBlock.content : null;

  function patchContent(patch: Partial<RichText>) {
    if (!content) return;
    onUpdateBlock({ content: { ...content, ...patch } });
  }

  const btnCls = (isOn?: boolean) =>
    `p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none ${
      isOn ? "bg-og-accent/10 text-og-accent" : "text-gray-500 hover:text-og-text hover:bg-og-surface-alt"
    }`;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-og-border bg-og-surface overflow-x-auto">
      <Select
        value={content?.font_family ?? ""}
        onChange={(v) => patchContent({ font_family: v || null })}
        options={FONT_FAMILIES}
        disabled={!active}
        className="w-36"
        aria-label={t("fontFamily")}
      />
      <NumberInput
        value={content?.font_size ? String(content.font_size) : ""}
        onChange={(v) => patchContent({ font_size: v ? Number(v) : null })}
        min={6}
        max={72}
        step={1}
        placeholder="10"
        disabled={!active}
        className="w-16"
        aria-label={t("fontSize")}
      />

      <div className="w-px h-5 bg-og-border mx-1" />

      <button type="button" onMouseDown={preventBlur} onClick={() => exec("bold")} disabled={!active} className={btnCls()} title={t("bold")}>
        <BoldIcon size={13} />
      </button>
      <button type="button" onMouseDown={preventBlur} onClick={() => exec("italic")} disabled={!active} className={btnCls()} title={t("italic")}>
        <ItalicIcon size={13} />
      </button>
      <button type="button" onMouseDown={preventBlur} onClick={() => exec("underline")} disabled={!active} className={btnCls()} title={t("underline")}>
        <UnderlineIcon size={13} />
      </button>

      <div className="w-px h-5 bg-og-border mx-1" />

      {(["left", "center", "right", "justify"] as TextAlign[]).map((align) => {
        const Icon = { left: AlignLeftIcon, center: AlignCenterIcon, right: AlignRightIcon, justify: AlignJustifyIcon }[align];
        return (
          <button
            key={align}
            type="button"
            onClick={() => patchContent({ align })}
            disabled={!active}
            className={btnCls(content?.align === align)}
            title={t(align === "left" ? "alignLeft" : align === "center" ? "alignCenter" : align === "right" ? "alignRight" : "alignJustify")}
          >
            <Icon size={13} />
          </button>
        );
      })}

      <div className="w-px h-5 bg-og-border mx-1" />

      <button
        type="button"
        onClick={() => patchContent({ list: content?.list === "bullet" ? null : "bullet" })}
        disabled={!active}
        className={btnCls(content?.list === "bullet")}
        title={t("bulletList")}
      >
        <BulletListIcon size={13} />
      </button>
      <button
        type="button"
        onClick={() => patchContent({ list: content?.list === "number" ? null : "number" })}
        disabled={!active}
        className={btnCls(content?.list === "number")}
        title={t("numberedList")}
      >
        <NumberListIcon size={13} />
      </button>

      <div className="w-px h-5 bg-og-border mx-1" />

      <label className={`p-1.5 rounded-md cursor-pointer ${!active ? "opacity-30 pointer-events-none" : "hover:bg-og-surface-alt"}`} title={t("textColor")}>
        <TextColorIcon size={13} className="text-gray-500" />
        <input type="color" className="sr-only" onChange={(e) => exec("foreColor", e.target.value)} disabled={!active} />
      </label>
      <label className={`p-1.5 rounded-md cursor-pointer ${!active ? "opacity-30 pointer-events-none" : "hover:bg-og-surface-alt"}`} title={t("highlight")}>
        <HighlightIcon size={13} className="text-gray-500" />
        <input type="color" className="sr-only" onChange={(e) => exec("hiliteColor", e.target.value)} disabled={!active} />
      </label>

      <div className="w-px h-5 bg-og-border mx-1" />

      <div className="flex items-center gap-1" title={t("lineSpacing")}>
        <LineSpacingIcon size={13} className="text-gray-400 shrink-0" />
        <Select
          value={content ? String(content.line_height) : ""}
          onChange={(v) => patchContent({ line_height: Number(v) })}
          options={LINE_SPACINGS.map((s) => ({ value: String(s), label: String(s) }))}
          disabled={!active}
          className="w-16"
          aria-label={t("lineSpacing")}
        />
      </div>
      <NumberInput
        value={content ? String(content.spacing_after) : ""}
        onChange={(v) => patchContent({ spacing_after: Number(v) || 0 })}
        min={0}
        step={1}
        disabled={!active}
        className="w-16"
        title={t("paragraphSpacing")}
        aria-label={t("paragraphSpacing")}
      />
    </div>
  );
}
