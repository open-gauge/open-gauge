"use client";

import { useEffect, useRef } from "react";
import { htmlToRuns, runsToHtml } from "@/lib/template-rich-text";
import { runPreviewText, type PageContext, type RowContext } from "@/lib/template-preview";
import type { RichText, TemplateType, TextRun } from "@/types/template";

function alignStyle(value: RichText): React.CSSProperties {
  return {
    textAlign: value.align,
    lineHeight: value.line_height,
    marginTop: `${value.spacing_before}pt`,
    marginBottom: `${value.spacing_after}pt`,
    fontFamily: value.font_family || undefined,
    fontSize: value.font_size ? `${value.font_size}pt` : undefined,
  };
}

function RunPreview({
  run,
  templateType,
  rowContext,
  pageContext,
}: {
  run: TextRun;
  templateType: TemplateType;
  rowContext?: RowContext;
  pageContext?: PageContext;
}) {
  const text = runPreviewText(run, templateType, rowContext, pageContext);
  let node: React.ReactNode = text;
  const style: React.CSSProperties = {};
  if (run.color) style.color = run.color;
  if (run.highlight) style.backgroundColor = run.highlight;
  if (run.bold) node = <strong>{node}</strong>;
  if (run.italic) node = <em>{node}</em>;
  if (run.underline) node = <u>{node}</u>;
  return <span style={style}>{node}</span>;
}

interface RichTextEditableProps {
  value: RichText;
  onChange: (next: RichText) => void;
  templateType: TemplateType;
  previewMode: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  rowContext?: RowContext;
  pageContext?: PageContext;
}

/**
 * ContentEditable text block backed by the structured `RichText` model.
 * Formatting comes from the browser's own `document.execCommand` (bold,
 * italic, underline, colors) invoked by the format toolbar while this
 * element is focused — this component only serializes the resulting DOM
 * back into `TextRun[]` on blur (see lib/template-rich-text.ts) and never
 * persists raw HTML.
 */
export function RichTextEditable({
  value,
  onChange,
  templateType,
  previewMode,
  readOnly,
  placeholder,
  className,
  style,
  onFocus,
  rowContext,
  pageContext,
}: RichTextEditableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!ref.current || focused.current) return;
    ref.current.innerHTML = runsToHtml(value.runs);
    // `previewMode` is a dependency (even though this branch never runs while it's true) because
    // the preview<->edit switch forces a fresh DOM node (see the `key` props below) — without it
    // here, a return trip to edit mode leaves the new node's content unset whenever `value.runs`
    // itself hadn't changed since the last sync, since that's this effect's only other trigger.
  }, [value.runs, previewMode]);

  if (previewMode) {
    // `key="preview"` forces a fresh DOM node on the template<->preview switch — the template
    // branch below sets its content imperatively (`ref.current.innerHTML = ...`), which React
    // never tracks, so reusing the same host node here would leave that raw HTML in place
    // underneath the newly rendered value, showing both the variable's label and its value.
    return (
      <div key="preview" className={className} style={{ ...alignStyle(value), ...style }}>
        {value.runs.length === 0 && placeholder ? (
          <span className="text-gray-300">{placeholder}</span>
        ) : (
          value.runs.map((run, i) => (
            <RunPreview key={i} run={run} templateType={templateType} rowContext={rowContext} pageContext={pageContext} />
          ))
        )}
      </div>
    );
  }

  function handleBlur() {
    focused.current = false;
    if (!ref.current) return;
    onChange({ ...value, runs: htmlToRuns(ref.current) });
  }

  return (
    <div
      key="edit"
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onFocus={() => {
        focused.current = true;
        onFocus?.();
      }}
      onBlur={handleBlur}
      data-placeholder={value.runs.length === 0 ? placeholder : undefined}
      className={`tpl-editable outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300 ${className ?? ""}`}
      style={{ ...alignStyle(value), ...style }}
    />
  );
}
