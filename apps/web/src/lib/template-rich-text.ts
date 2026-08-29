import type { TextRun } from "@/types/template";

// Converts between the structured `TextRun[]` model and the HTML rendered
// inside a contentEditable block, so text editing can use the browser's own
// `document.execCommand` formatting while the document model stays
// PDF-reproducible (no arbitrary HTML is ever persisted).

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function runToHtml(run: TextRun): string {
  const text = escapeHtml(run.text).replace(/\n/g, "<br>") || "&#8203;";
  if (run.variable) {
    return `<span class="tpl-var-chip" contenteditable="false" data-variable="${escapeAttr(run.variable)}">${escapeHtml(run.text)}</span>`;
  }
  let inner = text;
  if (run.bold) inner = `<strong>${inner}</strong>`;
  if (run.italic) inner = `<em>${inner}</em>`;
  if (run.underline) inner = `<u>${inner}</u>`;
  if (run.color || run.highlight) {
    const style = [run.color ? `color:${run.color}` : "", run.highlight ? `background-color:${run.highlight}` : ""]
      .filter(Boolean)
      .join(";");
    inner = `<span style="${style}">${inner}</span>`;
  }
  return inner;
}

/** Renders runs to the HTML string used as a contentEditable element's `innerHTML`. */
export function runsToHtml(runs: TextRun[]): string {
  if (runs.length === 0) return "";
  return runs.map(runToHtml).join("");
}

interface RunFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
  highlight: string | null;
}

function mergeAdjacent(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (
      prev &&
      !prev.variable &&
      !run.variable &&
      !!prev.bold === !!run.bold &&
      !!prev.italic === !!run.italic &&
      !!prev.underline === !!run.underline &&
      (prev.color ?? null) === (run.color ?? null) &&
      (prev.highlight ?? null) === (run.highlight ?? null)
    ) {
      prev.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

/** Parses a contentEditable element's live DOM back into structured `TextRun[]`. */
export function htmlToRuns(root: Node): TextRun[] {
  const runs: TextRun[] = [];

  function walk(node: Node, fmt: RunFormat) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/​/g, "");
        if (text) runs.push(buildRun(text, fmt));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;

      if (el.tagName === "BR") {
        runs.push({ text: "\n" });
        return;
      }
      if (el.dataset.variable) {
        runs.push({ text: el.textContent ?? "", variable: el.dataset.variable });
        return;
      }

      const next: RunFormat = { ...fmt };
      const tag = el.tagName;
      if (tag === "B" || tag === "STRONG") next.bold = true;
      if (tag === "I" || tag === "EM") next.italic = true;
      if (tag === "U") next.underline = true;
      if (el.style?.fontWeight === "bold" || Number(el.style?.fontWeight) >= 600) next.bold = true;
      if (el.style?.fontStyle === "italic") next.italic = true;
      if (el.style?.textDecorationLine?.includes("underline") || el.style?.textDecoration?.includes("underline")) next.underline = true;
      if (el.style?.color) next.color = el.style.color;
      if (el.style?.backgroundColor) next.highlight = el.style.backgroundColor;

      if (tag === "DIV" || tag === "P") {
        if (out_length(runs) > 0) runs.push({ text: "\n" });
      }

      walk(el, next);
    });
  }

  function out_length(r: TextRun[]) {
    return r.length;
  }

  function buildRun(text: string, fmt: RunFormat): TextRun {
    const run: TextRun = { text };
    if (fmt.bold) run.bold = true;
    if (fmt.italic) run.italic = true;
    if (fmt.underline) run.underline = true;
    if (fmt.color) run.color = fmt.color;
    if (fmt.highlight) run.highlight = fmt.highlight;
    return run;
  }

  walk(root, { bold: false, italic: false, underline: false, color: null, highlight: null });
  // Drop a leading synthetic newline produced by block-level splitting above.
  if (runs[0]?.text === "\n") runs.shift();
  return mergeAdjacent(runs);
}

/** Plain-text rendering of runs, used for search/preview contexts that don't need formatting. */
export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join("");
}
