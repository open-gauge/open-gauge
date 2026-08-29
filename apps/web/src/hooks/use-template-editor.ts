"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBlock, newBlockId } from "@/lib/template-blocks";
import {
  BODY_ZONE,
  deleteBlockAnywhere,
  duplicateBlockInPlace,
  findBlockAndZone,
  getBlockById,
  getZoneBlocks,
  insertIntoZone,
  moveBlockToZone,
  moveBlockWithinZone,
  parentBlockIdForZone,
  updateBlockAnywhere,
  type ZoneId,
} from "@/lib/template-zones";
import {
  branchNewTemplateVersion,
  getTemplate,
  publishTemplate,
  updateTemplate,
} from "@/services/template.service";
import type { BlockType, DocumentBlock, Template, TemplateDocument } from "@/types/template";

export type SaveState = "idle" | "saving" | "saved" | "unsaved" | "error";

const AUTOSAVE_DELAY_MS = 1500;
const MAX_HISTORY = 60;

function deepClone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

function cloneDoc(doc: TemplateDocument): TemplateDocument {
  return deepClone(doc);
}

export function useTemplateEditor(templateId: string) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [doc, setDoc] = useState<TemplateDocument | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockIdRaw] = useState<string | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<ZoneId>(BODY_ZONE);
  const [previewMode, setPreviewMode] = useState(false);

  const history = useRef<TemplateDocument[]>([]);
  const historyIndex = useRef(-1);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const docRef = useRef<TemplateDocument | null>(null);
  docRef.current = doc;

  const isDraft = template?.status === "draft";

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return getTemplate(templateId)
      .then((tpl) => {
        setTemplate(tpl);
        setDoc(tpl.document);
        setName(tpl.name);
        setDescription(tpl.description);
        history.current = [cloneDoc(tpl.document)];
        historyIndex.current = 0;
        dirtyRef.current = false;
        setSaveState("idle");
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Selecting a block also makes its zone the active insertion target — so clicking a tool
   * right after selecting a block in the footer inserts into that same footer zone. */
  function setSelectedBlockId(blockId: string | null) {
    setSelectedBlockIdRaw(blockId);
    if (blockId && docRef.current) {
      const located = findBlockAndZone(docRef.current, blockId);
      if (located) setActiveZoneId(located.zoneId);
    }
  }

  /** Clicking a zone's empty background always targets that zone for insertion — selectedBlockId
   * is cleared, not set to the owning Columns block, so a later `insertBlock` still lands in this
   * exact zone (see `activeContainerBlockId` below for how the Block panel finds the container's
   * properties without disturbing that). */
  function selectZone(zoneId: ZoneId) {
    setActiveZoneId(zoneId);
    setSelectedBlockIdRaw(null);
  }

  function pushHistory(next: TemplateDocument) {
    const trimmed = history.current.slice(0, historyIndex.current + 1);
    trimmed.push(cloneDoc(next));
    history.current = trimmed.slice(-MAX_HISTORY);
    historyIndex.current = history.current.length - 1;
  }

  const scheduleAutosave = useCallback(() => {
    if (!isDraft) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState("unsaved");
    autosaveTimer.current = setTimeout(() => {
      void saveDraft();
    }, AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft]);

  /** Applies a document mutation, records it for undo/redo, and schedules an autosave. */
  const mutate = useCallback(
    (mutator: (current: TemplateDocument) => TemplateDocument, opts: { record?: boolean } = {}) => {
      setDoc((current) => {
        if (!current) return current;
        const next = mutator(current);
        if (opts.record !== false) pushHistory(next);
        dirtyRef.current = true;
        return next;
      });
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  function undo() {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    setDoc(cloneDoc(history.current[historyIndex.current]));
    dirtyRef.current = true;
    scheduleAutosave();
  }

  function redo() {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current += 1;
    setDoc(cloneDoc(history.current[historyIndex.current]));
    dirtyRef.current = true;
    scheduleAutosave();
  }

  const canUndo = historyIndex.current > 0;
  const canRedo = historyIndex.current < history.current.length - 1;

  // --- Block operations (zone-aware — see lib/template-zones.ts) ----------

  /** Low-level insert: explicit target zone + index. Used by drag-and-drop, which resolves the
   * drop target itself (see resolveDropTarget in template-zones.ts). */
  function insertBlockAt(type: BlockType, zoneId: ZoneId, index: number, preset?: Partial<DocumentBlock>) {
    const block = { ...createBlock(type), ...preset } as DocumentBlock;
    mutate((current) => insertIntoZone(current, zoneId, index, block));
    setSelectedBlockId(block.id);
    return block.id;
  }

  /** Click-to-insert: targets the currently selected block's zone (inserting right after it), or
   * `activeZoneId` (appended at the end) if nothing is selected. */
  function insertBlock(type: BlockType, preset?: Partial<DocumentBlock>) {
    const current = docRef.current;
    if (!current) return null;
    let zoneId = activeZoneId;
    let index = getZoneBlocks(current, zoneId).length;
    if (selectedBlockId) {
      const located = findBlockAndZone(current, selectedBlockId);
      if (located) {
        zoneId = located.zoneId;
        index = located.index + 1;
      }
    }
    return insertBlockAt(type, zoneId, index, preset);
  }

  /** Inserts an already-built block (e.g. the Variables panel's "insert as table" shortcut),
   * next to the current selection the same way `insertBlock` does. */
  function insertRawBlock(block: DocumentBlock) {
    const current = docRef.current;
    if (!current) return;
    let zoneId = activeZoneId;
    let index = getZoneBlocks(current, zoneId).length;
    if (selectedBlockId) {
      const located = findBlockAndZone(current, selectedBlockId);
      if (located) {
        zoneId = located.zoneId;
        index = located.index + 1;
      }
    }
    mutate((doc) => insertIntoZone(doc, zoneId, index, block));
    setSelectedBlockId(block.id);
  }

  function updateBlock(blockId: string, patch: Partial<DocumentBlock>, opts: { record?: boolean } = {}) {
    mutate((current) => updateBlockAnywhere(current, blockId, patch), opts);
  }

  function deleteBlock(blockId: string) {
    mutate((current) => deleteBlockAnywhere(current, blockId));
    setSelectedBlockIdRaw((id) => (id === blockId ? null : id));
  }

  function duplicateBlock(blockId: string) {
    mutate((current) => duplicateBlockInPlace(current, blockId, (block) => ({ ...deepClone(block), id: newBlockId() })));
  }

  function moveBlock(blockId: string, direction: "up" | "down") {
    mutate((current) => moveBlockWithinZone(current, blockId, direction));
  }

  /** The single operation behind both same-zone drag-reordering and cross-zone drag (e.g.
   * dragging an image from the body into the header's right zone). */
  function moveBlockToPosition(blockId: string, targetZoneId: ZoneId, targetIndex: number) {
    mutate((current) => moveBlockToZone(current, blockId, targetZoneId, targetIndex));
  }

  function getBlock(blockId: string): DocumentBlock | null {
    return docRef.current ? getBlockById(docRef.current, blockId) : null;
  }

  function updateSettings(patch: Partial<TemplateDocument["settings"]>) {
    mutate((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  function updateHeader(patch: Partial<Omit<TemplateDocument["header"], "left" | "center" | "right">>) {
    mutate((current) => ({ ...current, header: { ...current.header, ...patch } }));
  }

  function updateFooter(patch: Partial<Omit<TemplateDocument["footer"], "left" | "center" | "right">>) {
    mutate((current) => ({ ...current, footer: { ...current.footer, ...patch } }));
  }

  // --- Persistence ----------------------------------------------------------

  async function saveDraft(): Promise<void> {
    if (!docRef.current || !template || !isDraft) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState("saving");
    try {
      const updated = await updateTemplate(template.id, { name, description, document: docRef.current });
      setTemplate(updated);
      dirtyRef.current = false;
      setSaveState("saved");
      setSaveError(null);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  async function publish(): Promise<Template | null> {
    if (!template) return null;
    await saveDraft();
    const updated = await publishTemplate(template.id);
    setTemplate(updated);
    return updated;
  }

  async function branchNewVersion(): Promise<Template | null> {
    if (!template) return null;
    const branched = await branchNewTemplateVersion(template.id);
    return branched;
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  // When nothing is directly selected but the active zone is a column inside a Columns block, the
  // Block panel still has something useful to show — that Columns block's own properties (width,
  // add/remove column). Clicking into the zone itself (rather than a block within it) can't select
  // the Columns block directly: doing so would make `insertBlock` follow the block's own location
  // instead of the zone the user just clicked (see `insertBlock` above).
  const activeContainerBlockId = selectedBlockId ?? parentBlockIdForZone(activeZoneId);

  return {
    template,
    doc,
    name,
    setName: (v: string) => { setName(v); scheduleAutosave(); },
    description,
    setDescription: (v: string) => { setDescription(v); scheduleAutosave(); },
    loading,
    loadError,
    saveState,
    saveError,
    isDraft,
    selectedBlockId,
    setSelectedBlockId,
    activeContainerBlockId,
    activeZoneId,
    selectZone,
    previewMode,
    setPreviewMode,
    reload: load,
    canUndo,
    canRedo,
    undo,
    redo,
    insertBlock,
    insertBlockAt,
    insertRawBlock,
    updateBlock,
    deleteBlock,
    duplicateBlock,
    moveBlock,
    moveBlockToPosition,
    getBlock,
    updateSettings,
    updateHeader,
    updateFooter,
    saveDraft,
    publish,
    branchNewVersion,
  };
}

export type TemplateEditorState = ReturnType<typeof useTemplateEditor>;
