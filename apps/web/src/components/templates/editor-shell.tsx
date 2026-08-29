"use client";

import { useEffect, useState } from "react";
import { DndContext, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTemplateEditor } from "@/hooks/use-template-editor";
import { EditorToolPanel, parseToolDragId } from "@/components/templates/editor-tool-panel";
import { EditorCanvas } from "@/components/templates/editor-canvas";
import { EditorSidePanel, type SidePanelTab } from "@/components/templates/editor-side-panel";
import { EditorFormatToolbar } from "@/components/templates/editor-format-toolbar";
import { createBlock } from "@/lib/template-blocks";
import { FOOTER_ZONE, HEADER_ZONE, resolveDropTarget } from "@/lib/template-zones";
import { uploadTemplateImage } from "@/services/template.service";
import {
  ChevronLeftIcon,
  CheckIcon,
  RedoIcon,
  UndoIcon,
  TemplatesIcon,
  VariableIcon,
} from "@/components/icons";
import type { DocumentBlock, RichText } from "@/types/template";

function hasRichContent(block: DocumentBlock | null): block is DocumentBlock & { content: RichText } {
  return !!block && (block.type === "heading" || block.type === "paragraph");
}

function SaveStateBadge({ state }: { state: "idle" | "saving" | "saved" | "unsaved" | "error" }) {
  const t = useTranslations("templates.editor");
  if (state === "idle") return null;
  const label = state === "saving" ? t("saving") : state === "saved" ? t("saved") : state === "unsaved" ? t("unsavedChanges") : t("saving");
  const cls = state === "error" ? "text-red-500" : state === "saved" ? "text-emerald-600" : "text-gray-400";
  return <span className={`text-[11px] ${cls} shrink-0`}>{label}</span>;
}

export function TemplateEditorShell({ templateId }: { templateId: string }) {
  const t = useTranslations("templates.editor");
  const router = useRouter();
  const editor = useTemplateEditor(templateId);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("variables");
  const [publishConfirming, setPublishConfirming] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"tools" | "variables" | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /** Zones nest (a column zone sits inside its Columns block, which sits inside body/header/
   * footer), so a dropped point is almost always inside more than one droppable rect at once. The
   * default `rectIntersection` collision strategy picks by overlap area, which favors the larger,
   * outer zone — dragging a tool onto a column would register as a drop on the whole header/body
   * instead. Preferring the smallest-area match among the droppables the pointer is actually inside
   * routes the drop to the innermost (most specific) zone under the cursor. */
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return [...pointerCollisions].sort((a, b) => {
        const ra = args.droppableRects.get(a.id);
        const rb = args.droppableRects.get(b.id);
        if (!ra || !rb) return 0;
        return ra.width * ra.height - rb.width * rb.height;
      });
    }
    return rectIntersection(args);
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement as HTMLElement | null;
      const inContentEditable = !!activeEl?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void editor.saveDraft();
        return;
      }
      if (inContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        editor.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        editor.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.doc]);

  if (editor.loading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-gray-400">
        <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
      </div>
    );
  }

  if (editor.loadError || !editor.template || !editor.doc) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {editor.loadError}
        </div>
      </div>
    );
  }

  const { template, doc } = editor;
  // Falls back to the owning Columns block when the active zone is one of its (possibly empty)
  // columns but nothing inside it is directly selected — otherwise the Block panel would go blank
  // the moment a column zone is clicked, with no way back to that block's own width/column controls.
  const selectedBlock = editor.activeContainerBlockId ? editor.getBlock(editor.activeContainerBlockId) : null;
  const editable = editor.isDraft;

  function insertAtSelection(type: Parameters<typeof editor.insertBlock>[0], preset?: Partial<DocumentBlock>) {
    editor.insertBlock(type, preset);
    setMobilePanel(null);
  }

  function insertVariable(variable: string, label: string) {
    if (hasRichContent(selectedBlock)) {
      editor.updateBlock(selectedBlock.id, {
        content: { ...selectedBlock.content, runs: [...selectedBlock.content.runs, { text: label, variable }] },
      });
      return;
    }
    const p = createBlock("paragraph");
    if (p.type === "paragraph") {
      p.content = { ...p.content, runs: [{ text: label, variable }] };
    }
    editor.insertRawBlock(p);
  }

  async function handleUploadImage(file: File) {
    const stored = await uploadTemplateImage(template.id, file);
    return { file_id: stored.id, url: stored.url ?? "" };
  }

  async function handlePublish() {
    setPublishConfirming(false);
    await editor.publish();
  }

  async function handleEditPublished() {
    const branched = await editor.branchNewVersion();
    if (branched) router.push(`/templates/${branched.id}`);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragEnd={(event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        const tool = parseToolDragId(activeId);
        if (tool) {
          const target = resolveDropTarget(doc, overId);
          editor.insertBlockAt(tool.type, target.zoneId, target.index, tool.preset);
          return;
        }
        if (activeId === overId) return;
        const target = resolveDropTarget(doc, overId, activeId);
        editor.moveBlockToPosition(activeId, target.zoneId, target.index);
      }}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-og-border bg-og-surface shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => router.push("/templates")} title={t("back")} className="p-1.5 rounded-lg text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors shrink-0">
              <ChevronLeftIcon size={16} />
            </button>
            <input
              value={editor.name}
              onChange={(e) => editor.setName(e.target.value)}
              disabled={!editable}
              className="text-sm font-semibold text-og-text bg-transparent outline-none border-b border-transparent focus:border-og-accent/40 min-w-0 disabled:text-gray-500"
            />
            <SaveStateBadge state={editor.saveState} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={editor.undo} disabled={!editor.canUndo} title={t("undo")} className="p-1.5 rounded-lg text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-30 disabled:pointer-events-none">
              <UndoIcon size={14} />
            </button>
            <button type="button" onClick={editor.redo} disabled={!editor.canRedo} title={t("redo")} className="p-1.5 rounded-lg text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-30 disabled:pointer-events-none">
              <RedoIcon size={14} />
            </button>

            <div className="flex items-center border border-og-border-md rounded-lg overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => editor.setPreviewMode(false)}
                className={`px-3 py-1.5 transition-colors ${!editor.previewMode ? "bg-og-accent/10 text-og-accent" : "text-gray-500 hover:bg-og-surface-alt"}`}
              >
                {t("templateMode")}
              </button>
              <button
                type="button"
                onClick={() => editor.setPreviewMode(true)}
                className={`px-3 py-1.5 transition-colors ${editor.previewMode ? "bg-og-accent/10 text-og-accent" : "text-gray-500 hover:bg-og-surface-alt"}`}
              >
                {t("previewMode")}
              </button>
            </div>

            {editable ? (
              publishConfirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t("publishConfirmTitle")}</span>
                  <button type="button" onClick={handlePublish} className="px-2.5 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors">
                    {t("confirmPublish")}
                  </button>
                  <button type="button" onClick={() => setPublishConfirming(false)} className="px-2 py-1.5 text-xs text-gray-400 hover:text-og-text transition-colors">
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void editor.saveDraft()}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
                  >
                    {t("saveDraft")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishConfirming(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <CheckIcon size={12} />
                    {t("publish")}
                  </button>
                </>
              )
            ) : (
              <button type="button" onClick={() => void handleEditPublished()} className="px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors">
                {t("editPublished")}
              </button>
            )}
          </div>
        </div>

        {/* Mobile panel toggles */}
        <div className="flex lg:hidden items-center gap-2 px-4 py-2 border-b border-og-border bg-og-surface shrink-0">
          <button type="button" onClick={() => setMobilePanel("tools")} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-og-border-md rounded-lg">
            <TemplatesIcon size={12} /> {t("openTools")}
          </button>
          <button type="button" onClick={() => setMobilePanel("variables")} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-og-border-md rounded-lg">
            <VariableIcon size={12} /> {t("openVariables")}
          </button>
        </div>

        <EditorFormatToolbar selectedBlock={selectedBlock} onUpdateBlock={(patch) => selectedBlock && editor.updateBlock(selectedBlock.id, patch)} disabled={!editable || editor.previewMode} />

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div className="hidden lg:block h-full">
            <EditorToolPanel
              onInsert={insertAtSelection}
              onOpenVariables={() => setSidePanelTab("variables")}
              onFocusHeader={() => { editor.updateSettings({ header_enabled: true }); editor.selectZone(HEADER_ZONE); }}
              onFocusFooter={() => { editor.updateSettings({ footer_enabled: true }); editor.selectZone(FOOTER_ZONE); }}
              disabled={!editable || editor.previewMode}
            />
          </div>

          <EditorCanvas
            doc={doc}
            templateType={template.type}
            previewMode={editor.previewMode}
            editable={editable}
            selectedBlockId={editor.selectedBlockId}
            onSelectBlock={editor.setSelectedBlockId}
            onSelectZone={editor.selectZone}
            onUpdateBlock={(id, patch) => editor.updateBlock(id, patch)}
            onDeleteBlock={editor.deleteBlock}
            onDuplicateBlock={editor.duplicateBlock}
            onMoveBlock={editor.moveBlock}
            onUploadImage={handleUploadImage}
          />

          <div className="hidden lg:block h-full">
            <EditorSidePanel
              activeTab={sidePanelTab}
              onChangeTab={setSidePanelTab}
              template={template}
              doc={doc}
              selectedBlock={selectedBlock}
              editable={editable}
              onInsertVariable={insertVariable}
              onInsertBlock={(block) => editor.insertRawBlock(block)}
              onUpdateSelectedBlock={(patch) => selectedBlock && editor.updateBlock(selectedBlock.id, patch)}
              onUpdateSettings={editor.updateSettings}
            />
          </div>
        </div>

        {/* Mobile drawers */}
        {mobilePanel && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobilePanel(null)} />
            <div className="absolute inset-y-0 left-0 w-64 bg-og-surface shadow-2xl overflow-y-auto">
              {mobilePanel === "tools" ? (
                <EditorToolPanel
                  onInsert={insertAtSelection}
                  onOpenVariables={() => setMobilePanel(null)}
                  onFocusHeader={() => { editor.updateSettings({ header_enabled: true }); editor.selectZone(HEADER_ZONE); setMobilePanel(null); }}
                  onFocusFooter={() => { editor.updateSettings({ footer_enabled: true }); editor.selectZone(FOOTER_ZONE); setMobilePanel(null); }}
                  disabled={!editable || editor.previewMode}
                />
              ) : (
                <EditorSidePanel
                  activeTab={sidePanelTab}
                  onChangeTab={setSidePanelTab}
                  template={template}
                  doc={doc}
                  selectedBlock={selectedBlock}
                  editable={editable}
                  onInsertVariable={(v, l) => { insertVariable(v, l); setMobilePanel(null); }}
                  onInsertBlock={(block) => { editor.insertRawBlock(block); setMobilePanel(null); }}
                  onUpdateSelectedBlock={(patch) => selectedBlock && editor.updateBlock(selectedBlock.id, patch)}
                  onUpdateSettings={editor.updateSettings}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}
