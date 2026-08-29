import { emptyRichText, type BlockType, type DocumentBlock, type TableBlock, type TableCell } from "@/types/template";
import type { TemplateCollectionVariableDef } from "@/lib/template-variables";

let fallbackCounter = 0;

export function newBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  fallbackCounter += 1;
  return `block-${Date.now()}-${fallbackCounter}`;
}

function blankCell() {
  return { content: emptyRichText("") };
}

/** Creates a new block of `type` with sensible defaults, ready to insert into a document. */
export function createBlock(type: BlockType): DocumentBlock {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return { id, type, level: 2, content: emptyRichText("Heading") };
    case "paragraph":
      return { id, type, content: emptyRichText("Paragraph text") };
    case "divider":
      return { id, type };
    case "page_break":
      return { id, type };
    case "spacer":
      return { id, type, height: 10 };
    case "table":
      return {
        id,
        type,
        columns: [{ width: null }, { width: null }, { width: null }],
        header_row: true,
        bordered: true,
        border_color: null,
        repeat: null,
        rows: [
          [{ content: emptyRichText("Column 1") }, { content: emptyRichText("Column 2") }, { content: emptyRichText("Column 3") }],
          [blankCell(), blankCell(), blankCell()],
        ],
      };
    case "measurement_table":
      return {
        id,
        type,
        bordered: true,
        columns: [
          { key: "index", label: "Point" },
          { key: "reference", label: "Reference" },
          { key: "measured", label: "Measured" },
          { key: "residual", label: "Residual" },
        ],
      };
    case "key_value":
      return { id, type, columns: 2, items: [] };
    case "equation":
      return { id, type, latex: "y = a_0 + a_1x", caption: null };
    case "graph":
      return {
        id,
        type,
        kind: "calibration_curve",
        title: "Calibration Curve",
        x_variable: "measurement.reference",
        y_variable: "measurement.measured",
        secondary_variable: null,
        x_label: "Reference",
        y_label: "Measured",
        x_unit: null,
        y_unit: null,
        show_legend: true,
        show_grid: true,
        width: 160,
        height: 90,
      };
    case "image":
      return { id, type, file_id: null, url: null, alt: "", width: 60, align: "center" };
    case "qr_code":
      return { id, type, payload_type: "asset_url", custom_value: null, variable: null, size: 30, error_correction: "M", quiet_zone: 4 };
    case "signature":
      return { id, type, mode: "prepared_by", label: "Prepared by" };
    case "date":
      return { id, type, variant: "current", format: "DD MMM YYYY" };
    case "columns":
      return { id, type, ratios: [1, 1], columns: [[], []] };
    case "section":
      return { id, type, title: "Section" };
  }
}

/** Content for a paragraph pre-filled with the page.current / page.total variables — the "Page
 * number" tool's insertion preset (merged onto `createBlock("paragraph")`). Page numbers are
 * ordinary variables (see lib/template-variables.ts), not a bespoke block type, so they can be
 * dropped into a header/footer/column zone like any other text. */
export function pageNumberParagraphContent() {
  return {
    runs: [
      { text: "Page " },
      { text: "1", variable: "page.current" },
      { text: " of " },
      { text: "1", variable: "page.total" },
    ],
    align: "center" as const,
    list: null,
    line_height: 1.4,
    spacing_before: 0,
    spacing_after: 0,
  };
}

/** Builds a table pre-bound to repeat for a collection variable (e.g. "measurements"), with a
 * header row of field labels and one template row whose cells hold the matching variable chips —
 * the shortcut behind the Variables panel's "insert as table" action for a collection. */
export function createRepeatingTableBlock(collectionKey: string, def: TemplateCollectionVariableDef, fieldLabels: Record<string, string>): TableBlock {
  const id = newBlockId();
  const columns = def.fields.map(() => ({ width: null }));
  const headerRow: TableCell[] = def.fields.map((f) => ({ content: emptyRichText(fieldLabels[f.key] ?? f.key) }));
  const templateRow: TableCell[] = def.fields.map((f) => ({
    content: {
      runs: [{ text: fieldLabels[f.key] ?? f.key, variable: `${def.itemScope}.${f.key}` }],
      align: "left",
      list: null,
      line_height: 1.4,
      spacing_before: 0,
      spacing_after: 4,
    },
  }));
  return { id, type: "table", columns, header_row: true, bordered: true, repeat: collectionKey, rows: [headerRow, templateRow] };
}
