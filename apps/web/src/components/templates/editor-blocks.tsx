"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Katex } from "@/components/calibration-model-panel";
import { RichTextEditable } from "@/components/templates/rich-text-editable";
import { QrPreview } from "@/components/templates/qr-preview";
import { BlockShell } from "@/components/templates/block-shell";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ImageIcon,
  PlusIcon,
  XIcon,
} from "@/components/icons";
import { COLORS } from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
import {
  findCollectionDef,
  type TemplateCollectionVariableDef,
} from "@/lib/template-variables";
import {
  previewCollectionRows,
  qrPayloadText,
  resolveSampleValue,
  substituteTokens,
  type PageContext,
  type RowContext,
} from "@/lib/template-preview";
import { sampleSeriesFor } from "@/lib/template-graph-sample";
import { columnsZone, zoneDroppableId, type ZoneId } from "@/lib/template-zones";
import { emptyRichText } from "@/types/template";
import type {
  ColumnsBlock,
  DateBlock,
  DividerBlock,
  DocumentBlock,
  EquationBlock,
  GraphBlock,
  HeadingBlock,
  ImageBlock,
  KeyValueBlock,
  MeasurementTableBlock,
  ParagraphBlock,
  QrCodeBlock,
  RichText,
  SectionBlock,
  SignatureBlock,
  SpacerBlock,
  TableBlock,
  TableCell,
  TemplateType,
} from "@/types/template";

/** Shared by every block renderer and by ZoneRenderer (which mounts them). Update/select/delete/
 * duplicate/move all take the target block's id directly rather than being pre-bound to "this"
 * block, so a block nested in a column/header/footer zone can be manipulated the same way a
 * top-level body block is. */
export interface BlockRenderCtx {
  templateType: TemplateType;
  previewMode: boolean;
  editable: boolean;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onSelectZone: (zoneId: ZoneId) => void;
  onUpdateBlock: (blockId: string, patch: Partial<DocumentBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: "up" | "down") => void;
  onUploadImage: (file: File) => Promise<{ file_id: string; url: string }>;
  pageContext?: PageContext;
  /** False inside a repeated (page 2+) header/footer instance — undefined/true everywhere else,
   * including the body. Threaded through so a Columns block nested in the header/footer inherits
   * it for its own nested zones; see the comment on ZoneRenderer's `interactive` prop. */
  interactive?: boolean;
}

export function BlockView({ block, ctx }: { block: DocumentBlock; ctx: BlockRenderCtx }) {
  switch (block.type) {
    case "heading":
      return <HeadingView block={block} ctx={ctx} />;
    case "paragraph":
      return <ParagraphView block={block} ctx={ctx} />;
    case "divider":
      return <DividerView block={block} />;
    case "page_break":
      return <div className="my-2 h-px border-t border-dashed border-gray-300" />;
    case "spacer":
      return <SpacerView block={block} ctx={ctx} />;
    case "table":
      return <TableView block={block} ctx={ctx} />;
    case "measurement_table":
      return <MeasurementTableView block={block} ctx={ctx} />;
    case "key_value":
      return <KeyValueView block={block} ctx={ctx} />;
    case "equation":
      return <EquationView block={block} ctx={ctx} />;
    case "graph":
      return <GraphView block={block} />;
    case "image":
      return <ImageView block={block} ctx={ctx} />;
    case "qr_code":
      return <QrCodeView block={block} ctx={ctx} />;
    case "signature":
      return <SignatureView block={block} ctx={ctx} />;
    case "date":
      return <DateView block={block} ctx={ctx} />;
    case "columns":
      return <ColumnsView block={block} ctx={ctx} />;
    case "section":
      return <SectionView block={block} ctx={ctx} />;
  }
}

// ---------------------------------------------------------------------------
// Zone renderer — a droppable, sortable list of blocks. Used for header/footer
// regions and column zones; the body's page-grouped rendering (editor-canvas.tsx)
// mounts the same BlockShell/BlockView pair directly since it needs to split
// blocks across physical `.a4-page` containers rather than one flat list.
// ---------------------------------------------------------------------------

export function ZoneRenderer({
  zoneId,
  blocks,
  ctx,
  className,
  interactive = true,
}: {
  zoneId: ZoneId;
  blocks: DocumentBlock[];
  ctx: BlockRenderCtx;
  className?: string;
  /** False for a repeated header/footer instance on page 2+ — same content, plain read-only
   * display. dnd-kit's sortable/droppable ids must each be registered once at a time, so the
   * SAME header/footer blocks can't be wired for drag-and-drop on every page they repeat on. */
  interactive?: boolean;
}) {
  const t = useTranslations("templates.editor");
  // A non-interactive instance (a repeated header/footer on page 2+) still calls useDroppable
  // unconditionally (Hook rules), but MUST NOT register under the real zone id: dnd-kit's
  // droppable registry holds one entry per id, and whichever instance's effect commits last wins
  // that slot — so an ordinary disabled duplicate here would silently shadow page 1's real,
  // enabled droppable the moment a second page exists, making the whole zone (and any Columns
  // block nested in it) permanently undroppable.
  const droppableId = interactive ? zoneDroppableId(zoneId) : `${zoneDroppableId(zoneId)}#readonly`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled: !ctx.editable || !interactive });

  // Propagated to descendants (not just used locally) so a Columns block nested in the header/
  // footer passes the same non-interactive-ness down to its own nested column zones — otherwise
  // those inner ZoneRenderer calls default `interactive` back to true and hit the exact id
  // collision this is guarding against, just one level down.
  const childCtx: BlockRenderCtx = ctx.interactive === interactive ? ctx : { ...ctx, interactive };

  if (!interactive) {
    const readOnlyCtx: BlockRenderCtx = { ...childCtx, editable: false };
    return (
      <div className={className}>
        {blocks.map((block) => (
          <div key={block.id}>
            <BlockView block={block} ctx={readOnlyCtx} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        e.stopPropagation();
        if (ctx.editable) ctx.onSelectZone(zoneId);
      }}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-og-accent/50 rounded" : ""}`}
    >
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => (
          <BlockShell
            key={block.id}
            blockId={block.id}
            selected={ctx.selectedBlockId === block.id}
            editable={ctx.editable}
            onSelect={() => ctx.onSelectBlock(block.id)}
            onDelete={() => ctx.onDeleteBlock(block.id)}
            onDuplicate={() => ctx.onDuplicateBlock(block.id)}
            onMoveUp={() => ctx.onMoveBlock(block.id, "up")}
            onMoveDown={() => ctx.onMoveBlock(block.id, "down")}
          >
            <BlockView block={block} ctx={childCtx} />
          </BlockShell>
        ))}
      </SortableContext>
      {blocks.length === 0 && !ctx.previewMode && (
        <p className="text-[10px] text-gray-300 italic py-1 select-none">{t("emptyZone")}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function ListWrap({ list, children }: { list: RichText["list"]; children: React.ReactNode }) {
  if (list === "bullet") return <ul className="list-disc pl-5">{children}</ul>;
  if (list === "number") return <ol className="list-decimal pl-5">{children}</ol>;
  return <>{children}</>;
}

function HeadingView({ block, ctx }: { block: HeadingBlock; ctx: BlockRenderCtx }) {
  const sizeClass = block.level === 1 ? "text-2xl font-bold" : block.level === 2 ? "text-lg font-semibold" : "text-base font-semibold";
  return (
    <ListWrap list={block.content.list}>
      <RichTextEditable
        value={block.content}
        onChange={(content) => ctx.onUpdateBlock(block.id, { content })}
        templateType={ctx.templateType}
        previewMode={ctx.previewMode}
        readOnly={!ctx.editable}
        placeholder="Heading"
        className={`text-og-text ${sizeClass}`}
        pageContext={ctx.pageContext}
      />
    </ListWrap>
  );
}

function ParagraphView({ block, ctx }: { block: ParagraphBlock; ctx: BlockRenderCtx }) {
  return (
    <ListWrap list={block.content.list}>
      <RichTextEditable
        value={block.content}
        onChange={(content) => ctx.onUpdateBlock(block.id, { content })}
        templateType={ctx.templateType}
        previewMode={ctx.previewMode}
        readOnly={!ctx.editable}
        placeholder="Paragraph text"
        className="text-sm text-og-text"
        pageContext={ctx.pageContext}
      />
    </ListWrap>
  );
}

function DividerView({ block }: { block: DividerBlock }) {
  void block;
  return <hr className="my-3 border-t border-gray-300" />;
}

function SpacerView({ block, ctx }: { block: SpacerBlock; ctx: BlockRenderCtx }) {
  return (
    <div
      style={{ height: `${block.height}mm` }}
      className={!ctx.previewMode ? "border border-dashed border-gray-200 rounded" : ""}
    />
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

interface RenderRow {
  key: string;
  /** null for a preview-expanded repeat row — not individually selectable/removable. */
  rowIndex: number | null;
  cells: TableCell[];
  isHeader: boolean;
  editable: boolean;
  rowContext?: RowContext;
}

function TableView({ block, ctx }: { block: TableBlock; ctx: BlockRenderCtx }) {
  const t = useTranslations("templates.blocks.table");
  const tCollections = useTranslations("templates.variables.collectionLabels");
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const repeatDef: TemplateCollectionVariableDef | null = block.repeat ? findCollectionDef(ctx.templateType, block.repeat) : null;
  const previewRows = ctx.previewMode && repeatDef ? previewCollectionRows(ctx.templateType, block.repeat!) : null;
  const templateRowIndex = block.rows.length - 1;
  const canEdit = ctx.editable && !ctx.previewMode;

  // The cell mini-toolbar is local state (activeCell), so it doesn't disappear on its own when
  // the user clicks a different block entirely — clear it once this table is no longer selected.
  useEffect(() => {
    if (ctx.selectedBlockId !== block.id) setActiveCell(null);
  }, [ctx.selectedBlockId, block.id]);

  function patchRows(mutator: (rows: TableCell[][]) => TableCell[][]) {
    ctx.onUpdateBlock(block.id, { rows: mutator(block.rows) });
  }
  function updateCell(ri: number, ci: number, patch: Partial<TableCell>) {
    patchRows((rows) => rows.map((row, r) => (r === ri ? row.map((cell, c) => (c === ci ? { ...cell, ...patch } : cell)) : row)));
  }
  function addRow() {
    const row: TableCell[] = block.columns.map(() => ({ content: emptyRichText("") }));
    patchRows((rows) => [...rows, row]);
  }
  function removeRow(ri: number) {
    if (block.rows.length <= 1) return;
    patchRows((rows) => rows.filter((_, r) => r !== ri));
    setActiveCell(null);
  }
  function addColumn() {
    ctx.onUpdateBlock(block.id, {
      columns: [...block.columns, { width: null }],
      rows: block.rows.map((row) => [...row, { content: emptyRichText("") }]),
    });
  }
  function mergeRight(ri: number, ci: number) {
    patchRows((rows) =>
      rows.map((row, r) => {
        if (r !== ri || ci >= row.length - 1) return row;
        const next = [...row];
        next[ci] = { ...next[ci], col_span: (next[ci].col_span ?? 1) + 1 };
        next.splice(ci + 1, 1);
        return next;
      }),
    );
  }
  function splitCell(ri: number, ci: number) {
    patchRows((rows) =>
      rows.map((row, r) => {
        if (r !== ri) return row;
        const span = row[ci]?.col_span ?? 1;
        if (span <= 1) return row;
        const next = [...row];
        next[ci] = { ...next[ci], col_span: span - 1 };
        next.splice(ci + 1, 0, { content: emptyRichText("") });
        return next;
      }),
    );
  }

  const renderRows: RenderRow[] = [];
  block.rows.forEach((row, ri) => {
    const isHeader = block.header_row && ri === 0;
    const isRepeatTemplateRow = !!repeatDef && ri === templateRowIndex && templateRowIndex > (block.header_row ? 0 : -1);
    if (isRepeatTemplateRow && previewRows) {
      previewRows.forEach((sample, si) => {
        renderRows.push({ key: `${ri}-${si}`, rowIndex: null, cells: row, isHeader: false, editable: false, rowContext: { itemScope: repeatDef!.itemScope, row: sample } });
      });
    } else {
      renderRows.push({ key: String(ri), rowIndex: ri, cells: row, isHeader, editable: !isRepeatTemplateRow || !ctx.previewMode });
    }
  });

  const borderColor = block.border_color || undefined;
  const cellBorderStyle: React.CSSProperties = block.bordered
    ? { border: `1px solid ${borderColor ?? "#d1d5db"}` }
    : { borderBottom: `1px solid ${borderColor ?? "#e5e7eb"}` };
  const activeRow = activeCell ? block.rows[activeCell.row] : undefined;
  const activeCellData = activeRow?.[activeCell!.col] ?? null;

  return (
    <div className="my-2">
      {canEdit && activeCell && activeCellData && (
        <div className="flex items-center gap-1 mb-1.5 px-2 py-1 bg-og-surface-alt border border-og-border-md rounded-lg">
          {(["left", "center", "right", "justify"] as const).map((align) => {
            const Icon = align === "left" ? AlignLeftIcon : align === "center" ? AlignCenterIcon : align === "right" ? AlignRightIcon : AlignJustifyIcon;
            return (
              <button
                key={align}
                type="button"
                onClick={() => updateCell(activeCell.row, activeCell.col, { content: { ...activeCellData.content, align } })}
                className={`p-1 rounded transition-colors ${activeCellData.content.align === align ? "bg-og-accent/10 text-og-accent" : "text-gray-400 hover:text-og-text"}`}
              >
                <Icon size={12} />
              </button>
            );
          })}
          <div className="w-px h-4 bg-og-border mx-0.5" />
          <label className="w-5 h-5 rounded border border-og-border-md cursor-pointer overflow-hidden shrink-0" title={t("cellBackground")} style={{ backgroundColor: activeCellData.background ?? "transparent" }}>
            <input
              type="color"
              className="sr-only"
              value={activeCellData.background ?? "#ffffff"}
              onChange={(e) => updateCell(activeCell.row, activeCell.col, { background: e.target.value })}
            />
          </label>
          {activeCellData.background && (
            <button type="button" onClick={() => updateCell(activeCell.row, activeCell.col, { background: null })} className="text-[10px] text-gray-400 hover:text-red-600 px-1">
              {t("clearBackground")}
            </button>
          )}
          <div className="w-px h-4 bg-og-border mx-0.5" />
          {activeCell.col < (activeRow?.length ?? 0) - 1 && (
            <button type="button" onClick={() => mergeRight(activeCell.row, activeCell.col)} className="text-[10px] font-medium text-gray-500 hover:text-og-text px-1.5 py-0.5 rounded hover:bg-og-surface transition-colors">
              {t("mergeRight")}
            </button>
          )}
          {(activeCellData.col_span ?? 1) > 1 && (
            <button type="button" onClick={() => splitCell(activeCell.row, activeCell.col)} className="text-[10px] font-medium text-gray-500 hover:text-og-text px-1.5 py-0.5 rounded hover:bg-og-surface transition-colors">
              {t("split")}
            </button>
          )}
          <button type="button" onClick={() => setActiveCell(null)} className="ml-auto p-1 text-gray-300 hover:text-gray-500 transition-colors">
            <XIcon size={11} />
          </button>
        </div>
      )}

      <table className="w-full border-collapse">
        <colgroup>
          {canEdit && <col className="w-4" />}
          {block.columns.map((c, i) => (
            <col key={i} style={{ width: c.width ? `${c.width}%` : undefined }} />
          ))}
        </colgroup>
        <tbody>
          {renderRows.map((row) => (
            <tr key={row.key}>
              {canEdit && (
                <td className="p-0 align-top">
                  {row.rowIndex !== null && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.rowIndex!)}
                      disabled={block.rows.length <= 1}
                      title={t("removeRow")}
                      className="w-4 h-4 mt-1.5 flex items-center justify-center text-gray-300 hover:text-red-600 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <XIcon size={9} />
                    </button>
                  )}
                </td>
              )}
              {row.cells.map((cell, ci) => {
                const isSelected = row.rowIndex !== null && activeCell?.row === row.rowIndex && activeCell?.col === ci;
                return (
                  <td
                    key={ci}
                    colSpan={cell.col_span ?? 1}
                    onClick={(e) => {
                      if (canEdit && row.rowIndex !== null) {
                        e.stopPropagation();
                        ctx.onSelectBlock(block.id);
                        setActiveCell({ row: row.rowIndex, col: ci });
                      }
                    }}
                    className={`px-2 py-1.5 text-xs align-top ${row.isHeader ? "font-semibold text-og-text" : "text-og-text"} ${
                      canEdit && row.rowIndex !== null ? "cursor-pointer" : ""
                    } ${isSelected ? "ring-2 ring-og-accent/50 ring-inset" : ""}`}
                    style={{ ...cellBorderStyle, backgroundColor: cell.background ?? (row.isHeader ? "var(--og-surface-alt)" : undefined) }}
                  >
                    <RichTextEditable
                      value={cell.content}
                      onChange={(content) => updateCell(row.rowIndex ?? Number(row.key.split("-")[0]), ci, { content })}
                      templateType={ctx.templateType}
                      previewMode={ctx.previewMode || !row.editable}
                      readOnly={!ctx.editable}
                      rowContext={row.rowContext}
                      pageContext={ctx.pageContext}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
        <div className="flex items-center gap-3 mt-1.5">
          <button type="button" onClick={addRow} className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400 hover:text-og-text transition-colors">
            <PlusIcon size={9} /> {t("addRow")}
          </button>
          <button type="button" onClick={addColumn} className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400 hover:text-og-text transition-colors">
            <PlusIcon size={9} /> {t("addColumn")}
          </button>
        </div>
      )}

      {repeatDef && !ctx.previewMode && (
        <p className="text-[10px] text-gray-400 mt-1">↻ {t("repeatFor")}: {translateDynamic(tCollections, block.repeat!)}</p>
      )}
    </div>
  );
}

const MEASUREMENT_COLUMN_TO_VARIABLE: Record<MeasurementTableBlock["columns"][number]["key"], string> = {
  index: "measurement.index",
  reference: "measurement.reference",
  measured: "measurement.measured",
  fitted: "measurement.fitted",
  residual: "measurement.residual",
  uncertainty: "measurement.uncertainty",
};

function MeasurementTableView({ block, ctx }: { block: MeasurementTableBlock; ctx: BlockRenderCtx }) {
  const rows = ctx.previewMode ? previewCollectionRows(ctx.templateType, "measurements") : Array.from({ length: 3 }, () => ({}));
  const cellCls = (isHeader: boolean) =>
    `px-2 py-1.5 text-xs text-right ${block.bordered ? "border border-gray-300" : "border-b border-gray-200"} ${
      isHeader ? "bg-og-surface-alt font-semibold text-og-text" : "text-og-text"
    }`;

  return (
    <table className="w-full my-2 border-collapse">
      <tbody>
        <tr>
          {block.columns.map((col, ci) => (
            <td key={ci} className={cellCls(true)}>{col.label}</td>
          ))}
        </tr>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {block.columns.map((col, ci) => {
              const variable = MEASUREMENT_COLUMN_TO_VARIABLE[col.key];
              const field = variable.split(".")[1];
              const value = ctx.previewMode
                ? String((row as Record<string, string | number>)[field] ?? "")
                : `{{${variable}}}`;
              return (
                <td key={ci} className={cellCls(false)}>{value}</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KeyValueView({ block, ctx }: { block: KeyValueBlock; ctx: BlockRenderCtx }) {
  const t = useTranslations("templates.blocks.keyValue");
  if (block.items.length === 0) {
    return <p className="my-2 text-xs text-gray-300 italic">{t("empty")}</p>;
  }
  return (
    <div className={`my-2 grid gap-x-6 gap-y-1.5 ${block.columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {block.items.map((item, i) => {
        const value = ctx.previewMode ? String(resolveSampleValue(ctx.templateType, item.variable, ctx.pageContext) ?? `{{${item.variable}}}`) : `{{${item.variable}}}`;
        return (
          <div key={i} className="flex items-baseline justify-between gap-2 text-sm border-b border-dotted border-gray-200 pb-0.5">
            <span className="text-gray-500 shrink-0">{item.label}</span>
            <span className="text-og-text font-medium text-right">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technical
// ---------------------------------------------------------------------------

function EquationView({ block, ctx }: { block: EquationBlock; ctx: BlockRenderCtx }) {
  const latex = ctx.previewMode ? substituteTokens(block.latex, ctx.templateType, ctx.pageContext) : block.latex;
  return (
    <div className="my-3 flex flex-col items-center gap-1">
      <Katex math={latex || " "} className="text-base" />
      {block.caption && <p className="text-xs text-gray-400">{block.caption}</p>}
    </div>
  );
}

function GraphView({ block }: { block: GraphBlock }) {
  const data = sampleSeriesFor(block.kind);
  return (
    <div className="my-3 mx-auto" style={{ width: `${block.width}mm`, height: `${block.height}mm` }}>
      {block.title && <p className="text-xs font-semibold text-og-text mb-1 text-center">{block.title}</p>}
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          {block.show_grid && <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />}
          <XAxis
            dataKey="x"
            tick={{ fontSize: 9 }}
            label={{ value: block.x_unit ? `${block.x_label} (${block.x_unit})` : block.x_label, position: "insideBottom", offset: -2, fontSize: 9 }}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            width={34}
            label={{ value: block.y_unit ? `${block.y_label} (${block.y_unit})` : block.y_label, angle: -90, position: "insideLeft", fontSize: 9 }}
          />
          {block.show_legend && <Legend wrapperStyle={{ fontSize: 9 }} />}
          <Line type="monotone" dataKey="y" stroke={COLORS.accent} strokeWidth={1.5} dot={{ r: 2 }} name={block.y_label} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ImageView({ block, ctx }: { block: ImageBlock; ctx: BlockRenderCtx }) {
  const t = useTranslations("templates.blocks.image");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploaded = await ctx.onUploadImage(file);
    ctx.onUpdateBlock(block.id, { file_id: uploaded.file_id, url: uploaded.url });
  }

  const alignClass = block.align === "center" ? "mx-auto" : block.align === "right" ? "ml-auto" : "";

  if (block.url) {
    return (
      <div className={`my-2 ${alignClass}`} style={{ width: block.width ? `${block.width}mm` : "60mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.alt} className="w-full h-auto rounded" />
      </div>
    );
  }

  return (
    <div
      className={`my-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-og-border-md rounded-lg py-8 ${alignClass}`}
      style={{ width: block.width ? `${block.width}mm` : "60mm" }}
    >
      <ImageIcon size={22} className="text-gray-300" />
      {ctx.editable && !ctx.previewMode && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-og-accent font-medium hover:underline">
            {t("upload")}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}

function QrCodeView({ block, ctx }: { block: QrCodeBlock; ctx: BlockRenderCtx }) {
  const text = qrPayloadText(block, ctx.templateType, ctx.previewMode) || " ";
  return (
    <div className="my-2 flex justify-center">
      <div style={{ width: `${block.size}mm`, height: `${block.size}mm` }}>
        <QrPreview text={text} sizePx={240} errorCorrection={block.error_correction} quietZone={block.quiet_zone} className="w-full h-full" />
      </div>
    </div>
  );
}

function SignatureView({ block, ctx }: { block: SignatureBlock; ctx: BlockRenderCtx }) {
  return (
    <div className="my-3 inline-flex flex-col">
      <div className="border-b border-gray-400 w-52 h-9" />
      {ctx.editable && !ctx.previewMode ? (
        <input
          type="text"
          value={block.label}
          onChange={(e) => ctx.onUpdateBlock(block.id, { label: e.target.value })}
          className="text-xs text-gray-500 mt-1 bg-transparent outline-none border-b border-transparent focus:border-og-accent/40"
        />
      ) : (
        <p className="text-xs text-gray-500 mt-1">{block.label}</p>
      )}
    </div>
  );
}

function DateView({ block, ctx }: { block: DateBlock; ctx: BlockRenderCtx }) {
  const value = ctx.previewMode ? resolveSampleValue(ctx.templateType, `date.${block.variant}`) : `{{date.${block.variant}}}`;
  return <span className="text-sm text-og-text">{String(value ?? "")}</span>;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function ColumnsView({ block, ctx }: { block: ColumnsBlock; ctx: BlockRenderCtx }) {
  return (
    <div className="flex gap-4 my-2">
      {block.columns.map((colBlocks, i) => (
        <div key={i} style={{ flex: block.ratios[i] ?? 1, minWidth: 0 }}>
          <ZoneRenderer zoneId={columnsZone(block.id, i)} blocks={colBlocks} ctx={ctx} interactive={ctx.interactive ?? true} className="min-h-[1.5rem] space-y-1" />
        </div>
      ))}
    </div>
  );
}

function SectionView({ block, ctx }: { block: SectionBlock; ctx: BlockRenderCtx }) {
  if (ctx.editable && !ctx.previewMode) {
    return (
      <div className="mt-5 mb-2 pt-2 border-t-2 border-og-accent/30">
        <input
          type="text"
          value={block.title}
          onChange={(e) => ctx.onUpdateBlock(block.id, { title: e.target.value })}
          className="text-[10px] font-semibold uppercase tracking-widest text-og-accent bg-transparent outline-none w-full"
        />
      </div>
    );
  }
  return (
    <div className="mt-5 mb-2 pt-2 border-t-2 border-og-accent/30">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-og-accent">{block.title}</p>
    </div>
  );
}
