"use client";

import { useTranslations } from "next-intl";
import { Select } from "@/components/select";
import { NumberInput } from "@/components/number-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { translateDynamic } from "@/lib/translate-dynamic";
import { collectionKeysForType, flatSampleValues } from "@/lib/template-variables";
import { emptyRichText } from "@/types/template";
import type {
  DocumentBlock,
  EquationBlock,
  GraphBlock,
  GraphKind,
  ImageBlock,
  KeyValueBlock,
  MeasurementColumnKey,
  MeasurementTableBlock,
  QrCodeBlock,
  SignatureBlock,
  SpacerBlock,
  TableBlock,
  TemplateType,
} from "@/types/template";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  );
}

const INPUT_CLS =
  "w-full px-2.5 py-1.5 rounded-lg border border-og-border-md text-xs text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:ring-og-accent/40 focus:border-og-accent/60 transition-colors placeholder-gray-400";

const ALL_MEASUREMENT_COLUMNS: MeasurementColumnKey[] = ["index", "reference", "measured", "fitted", "residual", "uncertainty"];

interface Props {
  block: DocumentBlock;
  templateType: TemplateType;
  onUpdate: (patch: Partial<DocumentBlock>) => void;
}

export function BlockPropertiesPanel({ block, templateType, onUpdate }: Props) {
  const t = useTranslations("templates.blocks");
  const tCollections = useTranslations("templates.variables.collectionLabels");
  const tLabels = useTranslations("templates.variables.labels");

  switch (block.type) {
    case "heading":
      return (
        <Field label="Level">
          <Select
            value={String(block.level)}
            onChange={(v) => onUpdate({ level: Number(v) as 1 | 2 | 3 })}
            options={[{ value: "1", label: "H1" }, { value: "2", label: "H2" }, { value: "3", label: "H3" }]}
            className="w-20"
          />
        </Field>
      );

    case "spacer": {
      const b = block as SpacerBlock;
      return (
        <Field label={t("spacer.height")}>
          <NumberInput value={String(b.height)} onChange={(v) => onUpdate({ height: Number(v) || 0 })} min={0} step={1} className="w-20" />
        </Field>
      );
    }

    case "table": {
      const b = block as TableBlock;
      const collections = collectionKeysForType(templateType);

      function addRow() {
        const row = b.columns.map(() => ({ content: emptyRichText("") }));
        onUpdate({ rows: [...b.rows, row] });
      }
      function removeRow(ri: number) {
        if (b.rows.length <= 1) return;
        onUpdate({ rows: b.rows.filter((_, r) => r !== ri) });
      }
      function addColumn() {
        onUpdate({ columns: [...b.columns, { width: null }], rows: b.rows.map((row) => [...row, { content: emptyRichText("") }]) });
      }
      function removeColumn(ci: number) {
        if (b.columns.length <= 1) return;
        onUpdate({ columns: b.columns.filter((_, c) => c !== ci), rows: b.rows.map((row) => row.filter((_, c) => c !== ci)) });
      }
      function setColumnWidth(ci: number, width: number | null) {
        onUpdate({ columns: b.columns.map((c, i) => (i === ci ? { ...c, width } : c)) });
      }

      return (
        <div className="space-y-3">
          <Field label={t("table.rows")}>
            <div className="space-y-1.5">
              {b.rows.map((_, ri) => (
                <div key={ri} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 w-10 shrink-0">{t("table.rowN", { n: ri + 1 })}</span>
                  <button type="button" onClick={() => removeRow(ri)} disabled={b.rows.length <= 1} className="ml-auto p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                    <TrashIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          </Field>
          <button type="button" onClick={addRow} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <PlusIcon size={11} /> {t("table.addRow")}
          </button>

          <Field label={t("table.columnWidths")}>
            <div className="space-y-1.5">
              {b.columns.map((c, ci) => (
                <div key={ci} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 w-10 shrink-0">{t("table.columnN", { n: ci + 1 })}</span>
                  <NumberInput value={c.width ? String(c.width) : ""} onChange={(v) => setColumnWidth(ci, v ? Number(v) : null)} min={1} max={100} placeholder={t("table.auto")} className="flex-1" />
                  <button type="button" onClick={() => removeColumn(ci)} disabled={b.columns.length <= 1} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                    <TrashIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          </Field>
          <button type="button" onClick={addColumn} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <PlusIcon size={11} /> {t("table.addColumn")}
          </button>

          <p className="text-[10px] text-gray-400">{t("table.cellHint")}</p>

          <label className="flex items-center gap-2 text-xs text-gray-500">
            <ToggleSwitch checked={b.header_row} onChange={(v) => onUpdate({ header_row: v })} size="sm" />
            {t("table.headerRow")}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <ToggleSwitch checked={b.bordered} onChange={(v) => onUpdate({ bordered: v })} size="sm" />
            {t("table.bordered")}
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{t("table.borderColor")}</span>
            <div className="flex items-center gap-1.5">
              {b.border_color && (
                <button type="button" onClick={() => onUpdate({ border_color: null })} className="text-[10px] text-gray-400 hover:text-red-600">
                  {t("table.clear")}
                </button>
              )}
              <label className="w-6 h-6 rounded border border-og-border-md cursor-pointer overflow-hidden shrink-0" style={{ backgroundColor: b.border_color ?? "#d1d5db" }}>
                <input type="color" className="sr-only" value={b.border_color ?? "#d1d5db"} onChange={(e) => onUpdate({ border_color: e.target.value })} />
              </label>
            </div>
          </div>

          <Field label={t("table.repeatFor")}>
            <Select
              value={b.repeat ?? ""}
              onChange={(v) => onUpdate({ repeat: v || null })}
              placeholder={t("table.repeatNone")}
              options={collections.map((c) => ({ value: c, label: translateDynamic(tCollections, c) }))}
              className="w-full"
            />
          </Field>
        </div>
      );
    }

    case "measurement_table": {
      const b = block as MeasurementTableBlock;
      const usedKeys = new Set(b.columns.map((c) => c.key));
      const available = ALL_MEASUREMENT_COLUMNS.filter((k) => !usedKeys.has(k));

      function updateLabel(i: number, label: string) {
        onUpdate({ columns: b.columns.map((c, ci) => (ci === i ? { ...c, label } : c)) });
      }
      function removeColumn(i: number) {
        onUpdate({ columns: b.columns.filter((_, ci) => ci !== i) });
      }
      function addColumn(key: MeasurementColumnKey) {
        onUpdate({ columns: [...b.columns, { key, label: translateDynamic(tLabels, `measurement.${key}`) }] });
      }

      return (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <ToggleSwitch checked={b.bordered} onChange={(v) => onUpdate({ bordered: v })} size="sm" />
            {t("table.bordered")}
          </label>
          <Field label={t("measurementTable.columns")}>
            <div className="space-y-1.5">
              {b.columns.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={c.label} onChange={(e) => updateLabel(i, e.target.value)} className={INPUT_CLS} />
                  <button type="button" onClick={() => removeColumn(i)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                    <TrashIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          </Field>
          {available.length > 0 && (
            <Select
              value=""
              onChange={(v) => addColumn(v as MeasurementColumnKey)}
              placeholder={t("table.addColumn")}
              options={available.map((k) => ({ value: k, label: translateDynamic(tLabels, `measurement.${k}`) }))}
              className="w-full"
            />
          )}
        </div>
      );
    }

    case "key_value": {
      const b = block as KeyValueBlock;
      const flat = flatSampleValues(templateType);
      const variableOptions = Object.keys(flat).map((key) => ({ value: key, label: `${translateDynamic(tLabels, key)}` }));

      function updateItem(i: number, patch: Partial<KeyValueBlock["items"][number]>) {
        onUpdate({ items: b.items.map((it, ii) => (ii === i ? { ...it, ...patch } : it)) });
      }
      function removeItem(i: number) {
        onUpdate({ items: b.items.filter((_, ii) => ii !== i) });
      }
      function addItem() {
        const first = variableOptions[0];
        onUpdate({ items: [...b.items, { label: first ? translateDynamic(tLabels, first.value) : "Field", variable: first?.value ?? "" }] });
      }

      return (
        <div className="space-y-3">
          <Field label={t("keyValue.columns")}>
            <Select value={String(b.columns)} onChange={(v) => onUpdate({ columns: Number(v) as 1 | 2 })} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} className="w-20" />
          </Field>
          <div className="space-y-2">
            {b.items.map((item, i) => (
              <div key={i} className="space-y-1 p-2 bg-og-surface-alt rounded-lg">
                <div className="flex items-center gap-1.5">
                  <input value={item.label} onChange={(e) => updateItem(i, { label: e.target.value })} placeholder={t("keyValue.label")} className={INPUT_CLS} />
                  <button type="button" onClick={() => removeItem(i)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors shrink-0">
                    <TrashIcon size={11} />
                  </button>
                </div>
                <Select value={item.variable} onChange={(v) => updateItem(i, { variable: v })} options={variableOptions} className="w-full" />
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <PlusIcon size={11} /> {t("keyValue.addItem")}
          </button>
        </div>
      );
    }

    case "equation": {
      const b = block as EquationBlock;
      return (
        <div className="space-y-3">
          <Field label={t("equation.latex")}>
            <textarea
              value={b.latex}
              onChange={(e) => onUpdate({ latex: e.target.value })}
              placeholder={t("equation.latexPlaceholder")}
              rows={3}
              className={`${INPUT_CLS} font-mono resize-none`}
            />
          </Field>
          <Field label={t("equation.caption")}>
            <input value={b.caption ?? ""} onChange={(e) => onUpdate({ caption: e.target.value || null })} className={INPUT_CLS} />
          </Field>
        </div>
      );
    }

    case "graph": {
      const b = block as GraphBlock;
      const kinds: GraphKind[] = ["calibration_curve", "reference_vs_measured", "residual_plot", "drift_over_time", "custom"];
      return (
        <div className="space-y-3">
          <Field label={t("graph.kind")}>
            <Select
              value={b.kind}
              onChange={(v) => onUpdate({ kind: v as GraphKind })}
              options={kinds.map((k) => ({
                value: k,
                label: t(`graph.kind${k.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}` as never),
              }))}
              className="w-full"
            />
          </Field>
          <Field label={t("graph.title")}>
            <input value={b.title} onChange={(e) => onUpdate({ title: e.target.value })} className={INPUT_CLS} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("graph.xLabel")}><input value={b.x_label} onChange={(e) => onUpdate({ x_label: e.target.value })} className={INPUT_CLS} /></Field>
            <Field label={t("graph.yLabel")}><input value={b.y_label} onChange={(e) => onUpdate({ y_label: e.target.value })} className={INPUT_CLS} /></Field>
            <Field label={t("graph.xUnit")}><input value={b.x_unit ?? ""} onChange={(e) => onUpdate({ x_unit: e.target.value || null })} className={INPUT_CLS} /></Field>
            <Field label={t("graph.yUnit")}><input value={b.y_unit ?? ""} onChange={(e) => onUpdate({ y_unit: e.target.value || null })} className={INPUT_CLS} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("graph.width")}><NumberInput value={String(b.width)} onChange={(v) => onUpdate({ width: Number(v) || 0 })} min={20} className="w-full" /></Field>
            <Field label={t("graph.height")}><NumberInput value={String(b.height)} onChange={(v) => onUpdate({ height: Number(v) || 0 })} min={20} className="w-full" /></Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <ToggleSwitch checked={b.show_legend} onChange={(v) => onUpdate({ show_legend: v })} size="sm" />
            {t("graph.legend")}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <ToggleSwitch checked={b.show_grid} onChange={(v) => onUpdate({ show_grid: v })} size="sm" />
            {t("graph.grid")}
          </label>
        </div>
      );
    }

    case "image": {
      const b = block as ImageBlock;
      return (
        <div className="space-y-3">
          <Field label={t("image.alt")}>
            <input value={b.alt} onChange={(e) => onUpdate({ alt: e.target.value })} className={INPUT_CLS} />
          </Field>
          <Field label={t("image.width")}>
            <NumberInput value={b.width ? String(b.width) : ""} onChange={(v) => onUpdate({ width: v ? Number(v) : null })} min={10} className="w-24" />
          </Field>
          <Field label={t("image.align")}>
            <Select
              value={b.align}
              onChange={(v) => onUpdate({ align: v as "left" | "center" | "right" })}
              options={[
                { value: "left", label: t("table.alignLeft") },
                { value: "center", label: t("table.alignCenter") },
                { value: "right", label: t("table.alignRight") },
              ]}
              className="w-full"
            />
          </Field>
          {b.url && (
            <button type="button" onClick={() => onUpdate({ file_id: null, url: null })} className="w-full px-2 py-1.5 text-[11px] font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
              {t("image.remove")}
            </button>
          )}
        </div>
      );
    }

    case "qr_code": {
      const b = block as QrCodeBlock;
      return (
        <div className="space-y-3">
          <Field label={t("qrCode.payloadType")}>
            <Select
              value={b.payload_type}
              onChange={(v) => onUpdate({ payload_type: v as QrCodeBlock["payload_type"] })}
              options={[
                { value: "asset_url", label: t("qrCode.assetUrl") },
                { value: "asset_id", label: t("qrCode.assetId") },
                { value: "certificate_url", label: t("qrCode.certificateUrl") },
                { value: "certificate_id", label: t("qrCode.certificateId") },
                { value: "custom", label: t("qrCode.custom") },
                { value: "variable", label: t("qrCode.variable") },
              ]}
              className="w-full"
            />
          </Field>
          {b.payload_type === "custom" && (
            <Field label={t("qrCode.customValue")}>
              <input value={b.custom_value ?? ""} onChange={(e) => onUpdate({ custom_value: e.target.value })} className={INPUT_CLS} />
            </Field>
          )}
          {b.payload_type === "variable" && (
            <Field label={t("qrCode.variable")}>
              <Select
                value={b.variable ?? ""}
                onChange={(v) => onUpdate({ variable: v })}
                options={Object.keys(flatSampleValues(templateType)).map((key) => ({ value: key, label: translateDynamic(tLabels, key) }))}
                className="w-full"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("qrCode.size")}><NumberInput value={String(b.size)} onChange={(v) => onUpdate({ size: Number(v) || 20 })} min={10} className="w-full" /></Field>
            <Field label={t("qrCode.quietZone")}><NumberInput value={String(b.quiet_zone)} onChange={(v) => onUpdate({ quiet_zone: Number(v) || 0 })} min={0} className="w-full" /></Field>
          </div>
          <Field label={t("qrCode.errorCorrection")}>
            <Select
              value={b.error_correction}
              onChange={(v) => onUpdate({ error_correction: v as QrCodeBlock["error_correction"] })}
              options={[{ value: "L", label: "L" }, { value: "M", label: "M" }, { value: "Q", label: "Q" }, { value: "H", label: "H" }]}
              className="w-20"
            />
          </Field>
        </div>
      );
    }

    case "signature": {
      const b = block as SignatureBlock;
      return (
        <div className="space-y-3">
          <Field label={t("signature.mode")}>
            <Select
              value={b.mode}
              onChange={(v) => {
                const mode = v as SignatureBlock["mode"];
                onUpdate({ mode, label: mode === "checked_by" ? t("signature.checkedBy") : t("signature.preparedBy") });
              }}
              options={[
                { value: "prepared_by", label: t("signature.preparedBy") },
                { value: "checked_by", label: t("signature.checkedBy") },
              ]}
              className="w-full"
            />
          </Field>
          <Field label={t("signature.label")}>
            <input value={b.label} onChange={(e) => onUpdate({ label: e.target.value })} className={INPUT_CLS} />
          </Field>
        </div>
      );
    }

    case "date": {
      const b = block;
      return (
        <Field label={t("date.variant")}>
          <Select
            value={b.variant}
            onChange={(v) => onUpdate({ variant: v as typeof b.variant })}
            options={[
              { value: "current", label: t("date.current") },
              { value: "calibration", label: t("date.calibration") },
              { value: "issue", label: t("date.issue") },
              { value: "expiration", label: t("date.expiration") },
            ]}
            className="w-full"
          />
        </Field>
      );
    }

    case "columns": {
      const b = block;

      function setRatio(i: number, value: number) {
        onUpdate({ ratios: b.ratios.map((rr, ri) => (ri === i ? value : rr)) });
      }
      function addColumn() {
        onUpdate({ ratios: [...b.ratios, 1], columns: [...b.columns, []] });
      }
      function removeColumn(i: number) {
        if (b.columns.length <= 1) return;
        onUpdate({ ratios: b.ratios.filter((_, ri) => ri !== i), columns: b.columns.filter((_, ci) => ci !== i) });
      }

      return (
        <div className="space-y-3">
          <Field label={t("columns.width")}>
            <div className="space-y-1.5">
              {b.ratios.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 w-10 shrink-0">#{i + 1}</span>
                  <NumberInput value={String(r)} onChange={(v) => setRatio(i, Number(v) || 1)} min={1} className="flex-1" />
                  <button
                    type="button"
                    onClick={() => removeColumn(i)}
                    disabled={b.columns.length <= 1}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <TrashIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          </Field>
          <button type="button" onClick={addColumn} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <PlusIcon size={11} /> {t("columns.addColumn")}
          </button>
        </div>
      );
    }

    case "section": {
      const b = block;
      return (
        <Field label={t("section.title")}>
          <input value={b.title} onChange={(e) => onUpdate({ title: e.target.value })} className={INPUT_CLS} />
        </Field>
      );
    }

    default:
      return null;
  }
}
