// Structured JSON document model for the Document Template editor.
//
// The document is never stored as an HTML string — every element is a typed
// block with structured properties so a future server-side renderer (PDF)
// can walk the same tree the browser editor renders. Keep new block types
// PDF-reproducible: no browser-only layout tricks.

export type TemplateType = "certificate" | "procedure";
export type TemplateStatus = "draft" | "published" | "archived";
export type PageSize = "a4" | "letter";
export type PageOrientation = "portrait" | "landscape";

export interface TemplateMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TemplateDocumentSettings {
  page_size: PageSize;
  orientation: PageOrientation;
  margins: TemplateMargins;
  default_font: string;
  default_font_size: number;
  header_enabled: boolean;
  footer_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Rich text (used inside paragraph/heading blocks, table cells, header/footer)
// ---------------------------------------------------------------------------

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string | null;
  highlight?: string | null;
  /** When set, this run is a variable chip: `text` is its human label, `variable` its dot-path token. */
  variable?: string | null;
}

export type TextAlign = "left" | "center" | "right" | "justify";
export type ListStyle = "bullet" | "number" | null;

export interface RichText {
  runs: TextRun[];
  align: TextAlign;
  list: ListStyle;
  line_height: number;
  spacing_before: number;
  spacing_after: number;
  /** Block-level override of the document's default typography (never per-character —
   * see AGENTS.md UI rules: "Avoid introducing unnecessary fonts"). Null = inherit default. */
  font_family?: string | null;
  font_size?: number | null;
}

export function emptyRichText(text = ""): RichText {
  return {
    runs: text ? [{ text }] : [],
    align: "left",
    list: null,
    line_height: 1.4,
    spacing_before: 0,
    spacing_after: 8,
  };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type BlockType =
  | "heading"
  | "paragraph"
  | "divider"
  | "page_break"
  | "spacer"
  | "table"
  | "measurement_table"
  | "key_value"
  | "equation"
  | "graph"
  | "image"
  | "qr_code"
  | "signature"
  | "date"
  | "columns"
  | "section";

interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  level: 1 | 2 | 3;
  content: RichText;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  content: RichText;
}

export interface DividerBlock extends BaseBlock {
  type: "divider";
}

export interface PageBreakBlock extends BaseBlock {
  type: "page_break";
}

export interface SpacerBlock extends BaseBlock {
  type: "spacer";
  height: number;
}

export interface TableColumn {
  /** Column track width, as a percentage of the table's own width; null = auto. */
  width: number | null;
}

export interface TableCell {
  content: RichText;
  col_span?: number;
  background?: string | null;
}

export interface TableBlock extends BaseBlock {
  type: "table";
  columns: TableColumn[];
  header_row: boolean;
  bordered: boolean;
  /** Wall/border color; null = the default gray. */
  border_color?: string | null;
  rows: TableCell[][];
  /** Collection variable key (e.g. "measurements") — when set, the last row repeats per item. */
  repeat: string | null;
}

export type MeasurementColumnKey = "index" | "reference" | "measured" | "fitted" | "residual" | "uncertainty";

export interface MeasurementTableBlock extends BaseBlock {
  type: "measurement_table";
  columns: { key: MeasurementColumnKey; label: string }[];
  bordered: boolean;
}

export interface KeyValueItem {
  label: string;
  variable: string;
}

export interface KeyValueBlock extends BaseBlock {
  type: "key_value";
  columns: 1 | 2;
  items: KeyValueItem[];
}

export interface EquationBlock extends BaseBlock {
  type: "equation";
  latex: string;
  caption: string | null;
}

export type GraphKind = "calibration_curve" | "reference_vs_measured" | "residual_plot" | "drift_over_time" | "custom";

export interface GraphBlock extends BaseBlock {
  type: "graph";
  kind: GraphKind;
  title: string;
  x_variable: string;
  y_variable: string;
  secondary_variable: string | null;
  x_label: string;
  y_label: string;
  x_unit: string | null;
  y_unit: string | null;
  show_legend: boolean;
  show_grid: boolean;
  width: number;
  height: number;
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  file_id: string | null;
  url: string | null;
  alt: string;
  width: number | null;
  align: "left" | "center" | "right";
}

export type QrPayloadType = "asset_url" | "asset_id" | "certificate_url" | "certificate_id" | "custom" | "variable";

export interface QrCodeBlock extends BaseBlock {
  type: "qr_code";
  payload_type: QrPayloadType;
  custom_value: string | null;
  variable: string | null;
  size: number;
  error_correction: "L" | "M" | "Q" | "H";
  quiet_zone: number;
}

export type SignatureMode = "prepared_by" | "checked_by";

export interface SignatureBlock extends BaseBlock {
  type: "signature";
  mode: SignatureMode;
  label: string;
}

export type DateVariant = "current" | "calibration" | "issue" | "expiration";

export interface DateBlock extends BaseBlock {
  type: "date";
  variant: DateVariant;
  format: string;
}

// A column is itself a small block container (a "zone") — any block type (image, signature,
// table, text, …) can be placed inside it, the same as the header/footer zones below. See
// lib/template-zones.ts for the addressing scheme that lets blocks move between zones.
export interface ColumnsBlock extends BaseBlock {
  type: "columns";
  ratios: number[];
  columns: DocumentBlock[][];
}

export interface SectionBlock extends BaseBlock {
  type: "section";
  title: string;
}

export type DocumentBlock =
  | HeadingBlock
  | ParagraphBlock
  | DividerBlock
  | PageBreakBlock
  | SpacerBlock
  | TableBlock
  | MeasurementTableBlock
  | KeyValueBlock
  | EquationBlock
  | GraphBlock
  | ImageBlock
  | QrCodeBlock
  | SignatureBlock
  | DateBlock
  | ColumnsBlock
  | SectionBlock;

// ---------------------------------------------------------------------------
// Header / footer / document
// ---------------------------------------------------------------------------

// A single zone (block container), same idea as a column — not a fixed left/center/right split.
// Insert a Columns block inside it for a multi-column layout, or a table, or just plain text.
export interface TemplateHeaderFooter {
  enabled: boolean;
  height: number;
  blocks: DocumentBlock[];
}

export interface TemplateDocument {
  settings: TemplateDocumentSettings;
  header: TemplateHeaderFooter;
  footer: TemplateHeaderFooter;
  blocks: DocumentBlock[];
}

export const DEFAULT_MARGINS: TemplateMargins = { top: 20, right: 18, bottom: 20, left: 18 };

export function defaultDocumentSettings(): TemplateDocumentSettings {
  return {
    page_size: "a4",
    orientation: "portrait",
    margins: { ...DEFAULT_MARGINS },
    default_font: "Inter",
    default_font_size: 10,
    header_enabled: true,
    footer_enabled: true,
  };
}

export function defaultHeaderFooter(height = 14): TemplateHeaderFooter {
  return {
    enabled: true,
    height,
    blocks: [],
  };
}

export function emptyDocument(): TemplateDocument {
  return {
    settings: defaultDocumentSettings(),
    header: defaultHeaderFooter(),
    footer: defaultHeaderFooter(),
    blocks: [],
  };
}

// ---------------------------------------------------------------------------
// Template entity
// ---------------------------------------------------------------------------

export interface Template {
  id: string;
  template_group_id: string;
  name: string;
  description: string | null;
  type: TemplateType;
  status: TemplateStatus;
  version: number;
  document: TemplateDocument;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface TemplateListItem {
  id: string;
  template_group_id: string;
  name: string;
  description: string | null;
  type: TemplateType;
  status: TemplateStatus;
  version: number;
  updated_at: string;
  created_by: string;
}

export interface TemplateCreateBody {
  name: string;
  description?: string | null;
  type: TemplateType;
}

export interface TemplateUpdateBody {
  name?: string;
  description?: string | null;
  document?: TemplateDocument;
}
