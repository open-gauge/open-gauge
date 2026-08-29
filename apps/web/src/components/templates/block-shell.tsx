"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, DragHandleIcon, TrashIcon } from "@/components/icons";

interface BlockShellProps {
  blockId: string;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: React.ReactNode;
}

/** Selection outline + hover controls (drag handle, move/duplicate/delete) shared by every block
 * type on the canvas — the block's own visual content is rendered as `children`. */
export function BlockShell({ blockId, selected, editable, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, children }: BlockShellProps) {
  const t = useTranslations("templates.editor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: blockId, disabled: !editable });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`relative group rounded-md px-1 -mx-1 transition-colors ${
        selected ? "ring-2 ring-og-accent/50 bg-og-accent/[0.03]" : "hover:ring-1 hover:ring-og-border-md"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {editable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          title={t("dragBlock")}
          className={`absolute -left-6 top-1.5 p-1 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <DragHandleIcon size={12} />
        </button>
      )}
      {editable && selected && (
        <div
          className="absolute -right-1 -top-8 flex items-center gap-0.5 bg-og-surface border border-og-border rounded-lg shadow-sm px-1 py-1 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onMoveUp} title={t("moveUp")} className="p-1 rounded text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors">
            <ChevronUpIcon size={12} />
          </button>
          <button type="button" onClick={onMoveDown} title={t("moveDown")} className="p-1 rounded text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors">
            <ChevronDownIcon size={12} />
          </button>
          <button type="button" onClick={onDuplicate} title={t("duplicateBlock")} className="p-1 rounded text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors">
            <CopyIcon size={12} />
          </button>
          <button type="button" onClick={onDelete} title={t("deleteBlock")} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
            <TrashIcon size={12} />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
