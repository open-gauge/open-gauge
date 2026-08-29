"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import { BlockShell } from "@/components/templates/block-shell";
import { BlockView, ZoneRenderer, type BlockRenderCtx } from "@/components/templates/editor-blocks";
import { TemplatesIcon } from "@/components/icons";
import { BODY_ZONE, FOOTER_ZONE, HEADER_ZONE, zoneDroppableId } from "@/lib/template-zones";
import type { DocumentBlock, PageSize, TemplateDocument, TemplateType } from "@/types/template";

const PAGE_SIZES_MM: Record<PageSize, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
};

function pageDimsMm(settings: TemplateDocument["settings"]): { w: number; h: number } {
  const base = PAGE_SIZES_MM[settings.page_size];
  return settings.orientation === "landscape" ? { w: base.h, h: base.w } : base;
}

function groupIntoPages(blocks: DocumentBlock[]): DocumentBlock[][] {
  const pages: DocumentBlock[][] = [[]];
  for (const block of blocks) {
    pages[pages.length - 1].push(block);
    if (block.type === "page_break") pages.push([]);
  }
  return pages;
}

export interface EditorCanvasProps {
  doc: TemplateDocument;
  templateType: TemplateType;
  previewMode: boolean;
  editable: boolean;
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onSelectZone: (zoneId: string) => void;
  onUpdateBlock: (id: string, patch: Partial<DocumentBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onDuplicateBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: "up" | "down") => void;
  onUploadImage: (file: File) => Promise<{ file_id: string; url: string }>;
}

export function EditorCanvas({
  doc,
  templateType,
  previewMode,
  editable,
  selectedBlockId,
  onSelectBlock,
  onSelectZone,
  onUpdateBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  onUploadImage,
}: EditorCanvasProps) {
  const t = useTranslations("templates.editor");
  const { w, h } = pageDimsMm(doc.settings);
  const pages = groupIntoPages(doc.blocks);
  const { setNodeRef } = useDroppable({ id: zoneDroppableId(BODY_ZONE), disabled: !editable });
  const margins = doc.settings.margins;

  const baseCtx: Omit<BlockRenderCtx, "pageContext"> = {
    templateType,
    previewMode,
    editable,
    selectedBlockId,
    onSelectBlock,
    onSelectZone,
    onUpdateBlock,
    onDeleteBlock,
    onDuplicateBlock,
    onMoveBlock,
    onUploadImage,
  };

  return (
    <div className="flex-1 min-w-0 overflow-auto bg-og-surface-alt/60 py-10 px-6" onClick={() => onSelectZone(BODY_ZONE)}>
      <div className="flex flex-col items-center gap-8">
        <div ref={setNodeRef}>
          <SortableContext items={doc.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col items-center gap-8">
              {pages.map((pageBlocks, pageIndex) => {
                const pageCtx: BlockRenderCtx = { ...baseCtx, pageContext: { current: pageIndex + 1, total: pages.length } };
                return (
                  <div
                    key={pageIndex}
                    className="relative bg-white dark:bg-og-surface shadow-lg rounded-sm flex flex-col"
                    style={{ width: `${w}mm`, minHeight: `${h}mm` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {doc.settings.header_enabled && doc.header.enabled && (
                      <div
                        className="px-2 border-b border-gray-100 text-xs text-gray-500"
                        style={{ minHeight: `${doc.header.height}mm`, margin: `0 ${margins.left}mm 0 ${margins.right}mm`, marginTop: `${margins.top / 2}mm` }}
                      >
                        <ZoneRenderer zoneId={HEADER_ZONE} blocks={doc.header.blocks} ctx={pageCtx} interactive={pageIndex === 0} />
                      </div>
                    )}

                    <div
                      className="flex-1"
                      style={{ padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm` }}
                      onClick={(e) => {
                        // The page container above stops propagation, so without this the body
                        // has no way to become the active insertion target again once the user
                        // has clicked into the header/footer/a column — every later tool click
                        // would keep landing wherever that stale selection pointed.
                        e.stopPropagation();
                        onSelectZone(BODY_ZONE);
                      }}
                    >
                      {pageBlocks.length === 0 && pages.length === 1 && (
                        <div className="flex flex-col items-center gap-2 py-10 text-center pointer-events-none select-none">
                          <TemplatesIcon size={26} className="text-gray-300" />
                          <p className="text-sm text-gray-400">{t("emptyCanvas")}</p>
                        </div>
                      )}
                      {pageBlocks.map((block) => (
                        <BlockShell
                          key={block.id}
                          blockId={block.id}
                          selected={selectedBlockId === block.id}
                          editable={editable && !previewMode}
                          onSelect={() => onSelectBlock(block.id)}
                          onDelete={() => onDeleteBlock(block.id)}
                          onDuplicate={() => onDuplicateBlock(block.id)}
                          onMoveUp={() => onMoveBlock(block.id, "up")}
                          onMoveDown={() => onMoveBlock(block.id, "down")}
                        >
                          <BlockView block={block} ctx={pageCtx} />
                        </BlockShell>
                      ))}
                    </div>

                    {doc.settings.footer_enabled && doc.footer.enabled && (
                      <div
                        className="px-2 border-t border-gray-100 text-xs text-gray-500"
                        style={{ minHeight: `${doc.footer.height}mm`, margin: `0 ${margins.left}mm 0 ${margins.right}mm`, marginBottom: `${margins.bottom / 2}mm` }}
                      >
                        <ZoneRenderer zoneId={FOOTER_ZONE} blocks={doc.footer.blocks} ctx={pageCtx} interactive={pageIndex === 0} />
                      </div>
                    )}

                    <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400">{pageIndex + 1} / {pages.length}</div>
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
