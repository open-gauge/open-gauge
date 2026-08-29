"use client";

import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import {
  CalendarIcon,
  CalibrationPlotIcon,
  ColumnsToolIcon,
  EquationIcon,
  FooterToolIcon,
  GraphToolIcon,
  HeaderToolIcon,
  HeadingToolIcon,
  HorizontalLineIcon,
  ImageIcon,
  KeyValueIcon,
  MeasurementTableIcon,
  PageBreakIcon,
  PageNumberIcon,
  ParagraphToolIcon,
  QrCodeIcon,
  SectionToolIcon,
  SignatureIcon,
  SpacerToolIcon,
  TableToolIcon,
  VariableIcon,
} from "@/components/icons";
import { pageNumberParagraphContent } from "@/lib/template-blocks";
import type { DocumentBlock, BlockType } from "@/types/template";

type ToolDef =
  | { kind: "block"; type: BlockType; icon: React.ReactNode; labelKey: string; preset?: Partial<DocumentBlock> }
  | { kind: "variables"; icon: React.ReactNode; labelKey: string }
  | { kind: "header"; icon: React.ReactNode; labelKey: string }
  | { kind: "footer"; icon: React.ReactNode; labelKey: string };

const GROUPS: { key: string; tools: ToolDef[] }[] = [
  {
    key: "groupBasic",
    tools: [
      { kind: "block", type: "heading", icon: <HeadingToolIcon size={15} />, labelKey: "heading" },
      { kind: "block", type: "paragraph", icon: <ParagraphToolIcon size={15} />, labelKey: "paragraph" },
      { kind: "block", type: "divider", icon: <HorizontalLineIcon size={15} />, labelKey: "divider" },
      { kind: "block", type: "page_break", icon: <PageBreakIcon size={15} />, labelKey: "pageBreak" },
    ],
  },
  {
    key: "groupData",
    tools: [
      { kind: "variables", icon: <VariableIcon size={15} />, labelKey: "variable" },
      { kind: "block", type: "table", icon: <TableToolIcon size={15} />, labelKey: "table" },
      { kind: "block", type: "measurement_table", icon: <MeasurementTableIcon size={15} />, labelKey: "measurementTable" },
      { kind: "block", type: "key_value", icon: <KeyValueIcon size={15} />, labelKey: "keyValue" },
    ],
  },
  {
    key: "groupTechnical",
    tools: [
      { kind: "block", type: "equation", icon: <EquationIcon size={15} />, labelKey: "equation" },
      { kind: "block", type: "graph", icon: <GraphToolIcon size={15} />, labelKey: "graph", preset: { kind: "custom" } as Partial<DocumentBlock> },
      {
        kind: "block",
        type: "graph",
        icon: <CalibrationPlotIcon size={15} />,
        labelKey: "calibrationPlot",
        preset: { kind: "calibration_curve", title: "Calibration Curve" } as Partial<DocumentBlock>,
      },
      { kind: "block", type: "image", icon: <ImageIcon size={15} />, labelKey: "image" },
      { kind: "block", type: "qr_code", icon: <QrCodeIcon size={15} />, labelKey: "qrCode" },
      { kind: "block", type: "signature", icon: <SignatureIcon size={15} />, labelKey: "signature" },
      { kind: "block", type: "date", icon: <CalendarIcon size={15} />, labelKey: "date" },
      {
        kind: "block",
        type: "paragraph",
        icon: <PageNumberIcon size={15} />,
        labelKey: "pageNumber",
        preset: { content: pageNumberParagraphContent() } as Partial<DocumentBlock>,
      },
    ],
  },
  {
    key: "groupLayout",
    tools: [
      { kind: "block", type: "columns", icon: <ColumnsToolIcon size={15} />, labelKey: "columns" },
      { kind: "block", type: "spacer", icon: <SpacerToolIcon size={15} />, labelKey: "spacer" },
      { kind: "block", type: "section", icon: <SectionToolIcon size={15} />, labelKey: "section" },
      { kind: "header", icon: <HeaderToolIcon size={15} />, labelKey: "header" },
      { kind: "footer", icon: <FooterToolIcon size={15} />, labelKey: "footer" },
    ],
  },
];

function DraggableToolButton({
  dragId,
  icon,
  label,
  disabled,
  onActivate,
}: {
  dragId: string;
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onActivate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId, disabled });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      onClick={onActivate}
      title={label}
      style={style}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg text-gray-500 hover:text-og-accent hover:bg-og-accent/10 transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        isDragging ? "opacity-30" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {icon}
      <span className="text-[9px] leading-tight text-center">{label}</span>
    </button>
  );
}

export interface EditorToolPanelProps {
  onInsert: (type: BlockType, preset?: Partial<DocumentBlock>) => void;
  onOpenVariables: () => void;
  onFocusHeader: () => void;
  onFocusFooter: () => void;
  disabled: boolean;
}

/** Left panel: click or drag a tool to insert the corresponding block at the current selection. */
export function EditorToolPanel({ onInsert, onOpenVariables, onFocusHeader, onFocusFooter, disabled }: EditorToolPanelProps) {
  const t = useTranslations("templates.tools");

  return (
    // `overflow-x-hidden` matters, not just cosmetically: per the CSS overflow spec, setting only
    // `overflow-y: auto` computes `overflow-x` to `auto` too (the "visible" axis isn't allowed to
    // stay visible once the other is scrollable). Left implicit, any tool label a hair wider than
    // this w-40 column makes the panel horizontally scrollable — and dnd-kit's DndContext autoScroll
    // picks that up as a real scroll container, so dragging a tool out of it scrolls the whole panel
    // sideways mid-drag until its icons are gone.
    <div className="w-40 h-full shrink-0 border-r border-og-border bg-og-surface overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
      {GROUPS.map((group) => (
        <div key={group.key}>
          <p className="px-1.5 mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-gray-400">{t(group.key as never)}</p>
          <div className="grid grid-cols-3 gap-0.5">
            {group.tools.map((tool, i) => {
              const label = t(tool.labelKey as never);
              if (tool.kind === "variables") {
                return <DraggableToolButton key={i} dragId={`special:variables`} icon={tool.icon} label={label} disabled={disabled} onActivate={onOpenVariables} />;
              }
              if (tool.kind === "header") {
                return <DraggableToolButton key={i} dragId={`special:header`} icon={tool.icon} label={label} disabled={disabled} onActivate={onFocusHeader} />;
              }
              if (tool.kind === "footer") {
                return <DraggableToolButton key={i} dragId={`special:footer`} icon={tool.icon} label={label} disabled={disabled} onActivate={onFocusFooter} />;
              }
              return (
                <DraggableToolButton
                  key={i}
                  dragId={`tool:${tool.type}:${i}`}
                  icon={tool.icon}
                  label={label}
                  disabled={disabled}
                  onActivate={() => { onInsert(tool.type, tool.preset); }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full drag-id -> { type, preset } map, built once. Ids are `tool:<type>:<index>` — the index
 * suffix lets two tools share the same block type (e.g. "Graph" and "Calibration data plot" both
 * insert a "graph" block) while still resolving to their own preset on drop. */
const TOOL_DRAG_ENTRIES: Record<string, { type: BlockType; preset?: Partial<DocumentBlock> }> = (() => {
  const map: Record<string, { type: BlockType; preset?: Partial<DocumentBlock> }> = {};
  GROUPS.forEach((group) => {
    group.tools.forEach((tool, i) => {
      if (tool.kind === "block") map[`tool:${tool.type}:${i}`] = { type: tool.type, preset: tool.preset };
    });
  });
  return map;
})();

/** Resolves a dropped `tool:*` dnd-kit id back into its block type + preset — used by the
 * drag-end handler in editor-shell.tsx. */
export function parseToolDragId(id: string): { type: BlockType; preset?: Partial<DocumentBlock> } | null {
  return TOOL_DRAG_ENTRIES[id] ?? null;
}
