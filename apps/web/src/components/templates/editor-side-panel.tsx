"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { translateDynamic } from "@/lib/translate-dynamic";
import { variableCategoriesForType, findCollectionDef } from "@/lib/template-variables";
import { createRepeatingTableBlock } from "@/lib/template-blocks";
import { Select } from "@/components/select";
import { NumberInput } from "@/components/number-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { BlockPropertiesPanel } from "@/components/templates/block-properties-panel";
import { SearchIcon, TableToolIcon } from "@/components/icons";
import { TEMPLATE_STATUS_STYLE } from "@/lib/tokens";
import type { PageOrientation, PageSize, DocumentBlock, Template, TemplateDocument } from "@/types/template";

export type SidePanelTab = "variables" | "block" | "document";

interface EditorSidePanelProps {
  activeTab: SidePanelTab;
  onChangeTab: (tab: SidePanelTab) => void;
  template: Template;
  doc: TemplateDocument;
  selectedBlock: DocumentBlock | null;
  editable: boolean;
  onInsertVariable: (variable: string, label: string) => void;
  onInsertBlock: (block: DocumentBlock) => void;
  onUpdateSelectedBlock: (patch: Partial<DocumentBlock>) => void;
  onUpdateSettings: (patch: Partial<TemplateDocument["settings"]>) => void;
}

export function EditorSidePanel(props: EditorSidePanelProps) {
  const { activeTab, onChangeTab } = props;
  const t = useTranslations("templates.editor");

  return (
    <div className="w-72 h-full shrink-0 border-l border-og-border bg-og-surface flex flex-col overflow-hidden">
      <div className="flex border-b border-og-border shrink-0">
        {(["variables", "block", "document"] as SidePanelTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChangeTab(tab)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-og-accent text-og-accent" : "border-transparent text-gray-400 hover:text-og-text"
            }`}
          >
            {t(tab === "variables" ? "variablesTab" : tab === "block" ? "propertiesTab" : "documentTab")}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === "variables" && <VariablesTab {...props} />}
        {activeTab === "block" && <BlockTab {...props} />}
        {activeTab === "document" && <DocumentTab {...props} />}
      </div>
    </div>
  );
}

function VariablesTab({ template, editable, onInsertVariable, onInsertBlock }: EditorSidePanelProps) {
  const t = useTranslations("templates.editor");
  const tCategoryLabels = useTranslations("templates.variables.categoryLabels");
  const tCategoryDesc = useTranslations("templates.variables.categoryDescriptions");
  const tLabels = useTranslations("templates.variables.labels");
  const tCollectionLabels = useTranslations("templates.variables.collectionLabels");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const categories = variableCategoriesForType(template.type);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-og-border shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-og-surface-alt border border-og-border-md rounded-lg">
          <SearchIcon size={12} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchVariables")}
            className="flex-1 bg-transparent text-xs text-og-text outline-none placeholder:text-gray-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4">
        {categories.map((cat) => {
          const scalars = cat.variables.filter((v) => {
            const label = translateDynamic(tLabels, v.key);
            return !needle || v.key.toLowerCase().includes(needle) || label.toLowerCase().includes(needle);
          });
          const collections = (cat.collections ?? []).filter((c) => {
            if (!needle) return true;
            return c.fields.some((f) => `${c.itemScope}.${f.key}`.toLowerCase().includes(needle) || translateDynamic(tLabels, `${c.itemScope}.${f.key}`).toLowerCase().includes(needle));
          });
          if (scalars.length === 0 && collections.length === 0) return null;

          return (
            <div key={cat.key}>
              <p className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400" title={translateDynamic(tCategoryDesc, cat.key)}>
                {translateDynamic(tCategoryLabels, cat.key)}
              </p>
              <div className="space-y-0.5">
                {scalars.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    disabled={!editable}
                    onClick={() => onInsertVariable(v.key, translateDynamic(tLabels, v.key))}
                    title={translateDynamic(tCategoryDesc, cat.key)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-og-surface-alt transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <p className="text-xs font-medium text-og-text truncate">{translateDynamic(tLabels, v.key)}</p>
                    <p className="text-[10px] font-mono text-gray-400 truncate">{`{{${v.key}}}`}</p>
                  </button>
                ))}
                {collections.map((c) => {
                  const def = findCollectionDef(template.type, c.key)!;
                  return (
                    <div key={c.key} className="rounded-md border border-og-border-md/60 my-1">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => {
                          const fieldLabels = Object.fromEntries(def.fields.map((f) => [f.key, translateDynamic(tLabels, `${def.itemScope}.${f.key}`)]));
                          onInsertBlock(createRepeatingTableBlock(c.key, def, fieldLabels));
                        }}
                        title={translateDynamic(tCategoryDesc, cat.key)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-og-surface-alt transition-colors rounded-t-md disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <TableToolIcon size={11} className="text-og-accent shrink-0" />
                          <span className="text-xs font-medium text-og-text truncate">{translateDynamic(tCollectionLabels, c.key)}</span>
                        </span>
                        <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-og-accent/10 text-og-accent">{t("collectionBadge")}</span>
                      </button>
                      <div className="px-2 pb-1.5 space-y-0.5">
                        {c.fields.map((f) => {
                          const key = `${def.itemScope}.${f.key}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={!editable}
                              onClick={() => onInsertVariable(key, translateDynamic(tLabels, key))}
                              className="w-full text-left px-1.5 py-1 rounded hover:bg-og-surface-alt transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                              <p className="text-[11px] text-gray-500 truncate">{translateDynamic(tLabels, key)}</p>
                              <p className="text-[9px] font-mono text-gray-300 truncate">{`{{${key}}}`}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlockTab({ selectedBlock, template, editable, onUpdateSelectedBlock }: EditorSidePanelProps) {
  const t = useTranslations("templates.editor");
  if (!selectedBlock) {
    return <p className="h-full overflow-y-auto p-4 text-xs text-gray-400">{t("noSelection")}</p>;
  }
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-3">
      <BlockPropertiesPanel block={selectedBlock} templateType={template.type} onUpdate={editable ? onUpdateSelectedBlock : () => {}} />
    </div>
  );
}

const PAGE_SIZES: PageSize[] = ["a4", "letter"];
const ORIENTATIONS: PageOrientation[] = ["portrait", "landscape"];

function DocumentTab({ doc, template, editable, onUpdateSettings }: EditorSidePanelProps) {
  const t = useTranslations("templates.document");
  const tStatus = useTranslations("tokens.templateStatus");
  const locale = useLocale();
  const disabled = !editable;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-3 space-y-4">
      <div className="flex items-center justify-between px-2.5 py-2 bg-og-surface-alt rounded-lg">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${TEMPLATE_STATUS_STYLE[template.status]}`}>
          {translateDynamic(tStatus, template.status)}
        </span>
        <span className="text-[10px] text-gray-400">{t("version", { version: template.version })}</span>
      </div>
      <p className="text-[10px] text-gray-400 -mt-2">
        {t("lastModified", { date: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(template.updated_at)) })}
      </p>

      <div className="space-y-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t("pageSize")}</label>
        <Select
          value={doc.settings.page_size}
          onChange={(v) => onUpdateSettings({ page_size: v as PageSize })}
          disabled={disabled}
          options={PAGE_SIZES.map((s) => ({ value: s, label: t(s) }))}
          className="w-full"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t("orientation")}</label>
        <Select
          value={doc.settings.orientation}
          onChange={(v) => onUpdateSettings({ orientation: v as PageOrientation })}
          disabled={disabled}
          options={ORIENTATIONS.map((o) => ({ value: o, label: t(o) }))}
          className="w-full"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t("margins")}</label>
        <div className="grid grid-cols-2 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <div key={side} className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 w-10 shrink-0">{t(`margin${side[0].toUpperCase()}${side.slice(1)}` as never)}</span>
              <NumberInput
                value={String(doc.settings.margins[side])}
                onChange={(v) => onUpdateSettings({ margins: { ...doc.settings.margins, [side]: Number(v) || 0 } })}
                min={0}
                disabled={disabled}
                className="w-16"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t("defaultFont")}</label>
        <Select
          value={doc.settings.default_font}
          onChange={(v) => onUpdateSettings({ default_font: v })}
          disabled={disabled}
          options={[
            { value: "Inter", label: "Inter" },
            { value: "Arial, sans-serif", label: "Arial" },
            { value: "'Times New Roman', serif", label: "Times New Roman" },
          ]}
          className="w-full"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t("defaultFontSize")}</label>
        <NumberInput value={String(doc.settings.default_font_size)} onChange={(v) => onUpdateSettings({ default_font_size: Number(v) || 10 })} min={6} max={24} disabled={disabled} className="w-20" />
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-500">
        <ToggleSwitch checked={doc.settings.header_enabled} onChange={(v) => onUpdateSettings({ header_enabled: v })} disabled={disabled} size="sm" />
        {t("headerEnabled")}
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-500">
        <ToggleSwitch checked={doc.settings.footer_enabled} onChange={(v) => onUpdateSettings({ footer_enabled: v })} disabled={disabled} size="sm" />
        {t("footerEnabled")}
      </label>
    </div>
  );
}
