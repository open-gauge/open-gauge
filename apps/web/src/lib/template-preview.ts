import type { QrCodeBlock, RichText, TemplateType, TextRun } from "@/types/template";
import { collectionSampleRows, findCollectionDef, flatSampleValues } from "@/lib/template-variables";

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export interface PageContext {
  current: number;
  total: number;
}

/** Resolves a single variable token's sample value for Preview Data mode. Undefined if unknown.
 * `page.current`/`page.total` resolve against `pageContext` (the actual page a block renders on)
 * when supplied, falling back to the generic catalog sample (both "1") otherwise. */
export function resolveSampleValue(type: TemplateType, key: string, pageContext?: PageContext): string | number | undefined {
  if (pageContext) {
    if (key === "page.current") return pageContext.current;
    if (key === "page.total") return pageContext.total;
  }
  return flatSampleValues(type)[key];
}

/** `{{asset.id}}` -> "OG-000123" (or the raw token if the variable is unknown). */
export function substituteTokens(text: string, type: TemplateType, pageContext?: PageContext): string {
  return text.replace(TOKEN_RE, (match, key: string) => {
    const value = resolveSampleValue(type, key, pageContext);
    return value === undefined ? match : String(value);
  });
}

export interface RowContext {
  /** e.g. "measurement" for the "measurements" collection — matches variable runs like "measurement.residual". */
  itemScope: string;
  row: Record<string, string | number>;
}

/** Preview-mode text for a single run: variable chips resolve to their sample value.
 * Inside a repeating table row, `rowContext` resolves an itemScope-prefixed variable
 * (e.g. "measurement.residual") against that specific row instead of the flat sample map. */
export function runPreviewText(run: TextRun, type: TemplateType, rowContext?: RowContext, pageContext?: PageContext): string {
  if (!run.variable) return run.text;
  if (rowContext && run.variable.startsWith(`${rowContext.itemScope}.`)) {
    const field = run.variable.slice(rowContext.itemScope.length + 1);
    if (field in rowContext.row) return String(rowContext.row[field]);
  }
  const value = resolveSampleValue(type, run.variable, pageContext);
  return value === undefined ? `{{${run.variable}}}` : String(value);
}

export function richTextPreviewPlain(content: RichText, type: TemplateType, rowContext?: RowContext, pageContext?: PageContext): string {
  return content.runs.map((r) => runPreviewText(r, type, rowContext, pageContext)).join("");
}

/** Sample rows for a repeating table/collection block in Preview Data mode. */
export function previewCollectionRows(type: TemplateType, collectionKey: string): Record<string, string | number>[] {
  return collectionSampleRows(type, collectionKey);
}

export function isKnownCollection(type: TemplateType, collectionKey: string): boolean {
  return findCollectionDef(type, collectionKey) !== null;
}

const QR_PAYLOAD_VARIABLE: Record<Exclude<QrCodeBlock["payload_type"], "custom" | "variable">, string> = {
  asset_url: "asset.public_url",
  asset_id: "asset.id",
  certificate_url: "calibration.certificate_url",
  certificate_id: "calibration.certificate_number",
};

/** Resolves what text a QR code block should encode, in either editor mode. */
export function qrPayloadText(block: QrCodeBlock, type: TemplateType, previewMode: boolean): string {
  if (block.payload_type === "custom") return block.custom_value || "";
  const variable = block.payload_type === "variable" ? block.variable ?? "" : QR_PAYLOAD_VARIABLE[block.payload_type];
  if (!variable) return "";
  return previewMode ? String(resolveSampleValue(type, variable) ?? `{{${variable}}}`) : `{{${variable}}}`;
}
