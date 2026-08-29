// Addressing scheme for the document's block *zones* — the main body, the header, the footer,
// and each column of any Columns block anywhere in the document. Every zone holds a plain
// `DocumentBlock[]`, so any block type can be moved between any zones (an image or signature in
// the header, a table inside a column, etc.). The header/footer are each a *single* zone — not a
// fixed left/center/right split — so a multi-column look comes from inserting a Columns block
// inside them, the same as anywhere else in the document.
//
// A zone id is one of:
//   "body"
//   "header" | "footer"
//   "columns.<blockId>.<columnIndex>"
//
// dnd-kit droppable ids for a zone are prefixed "zone:" (see ZONE_DROPPABLE_PREFIX) to keep them
// unambiguous against block ids (crypto.randomUUID(), which never contains a ".").
import type { ColumnsBlock, DocumentBlock, TemplateDocument } from "@/types/template";

export type ZoneId = string;

export const BODY_ZONE: ZoneId = "body";
export const HEADER_ZONE: ZoneId = "header";
export const FOOTER_ZONE: ZoneId = "footer";
export const ZONE_DROPPABLE_PREFIX = "zone:";

export function columnsZone(blockId: string, index: number): ZoneId {
  return `columns.${blockId}.${index}`;
}

/** The id of the Columns block that owns `zoneId`, or `null` for body/header/footer. Lets the
 * editor re-select the container block when the user clicks into one of its (possibly non-empty)
 * column zones — clicking a zone's content always targets the zone itself for insertion, and
 * without this there would be no way back to the Columns block's own properties (width/add/remove
 * column) once a column held content, since a click there can never bubble past the zone. */
export function parentBlockIdForZone(zoneId: ZoneId): string | null {
  const parts = zoneId.split(".");
  return parts[0] === "columns" ? parts[1] : null;
}

export function zoneDroppableId(zoneId: ZoneId): string {
  return `${ZONE_DROPPABLE_PREFIX}${zoneId}`;
}

export function isZoneDroppableId(id: string): boolean {
  return id.startsWith(ZONE_DROPPABLE_PREFIX);
}

export function zoneIdFromDroppable(id: string): ZoneId {
  return id.slice(ZONE_DROPPABLE_PREFIX.length);
}

interface ParsedZone {
  region: "body" | "header" | "footer" | "columns";
  blockId?: string;
  index?: number;
}

function parseZoneId(zoneId: ZoneId): ParsedZone {
  if (zoneId === BODY_ZONE) return { region: "body" };
  if (zoneId === HEADER_ZONE) return { region: "header" };
  if (zoneId === FOOTER_ZONE) return { region: "footer" };
  const parts = zoneId.split(".");
  if (parts[0] === "columns") {
    return { region: "columns", blockId: parts[1], index: Number(parts[2]) };
  }
  return { region: "body" };
}

/** Rewrites `blockId` in place via `fn`, searching nested Columns blocks recursively. Returns the
 * original `blocks` array (same reference) when `blockId` isn't found anywhere in this tree, so
 * callers can tell "found and replaced" apart from "not in this tree" — needed because a Columns
 * block's own zone lookups (see `setZoneBlocks`) must try the body, header, and footer trees in
 * turn and only commit the one that actually contains it. */
function mapBlockById(blocks: DocumentBlock[], blockId: string, fn: (block: DocumentBlock) => DocumentBlock): DocumentBlock[] {
  let found = false;
  const next = blocks.map((block) => {
    if (block.id === blockId) {
      found = true;
      return fn(block);
    }
    if (block.type === "columns") {
      let columnFound = false;
      const columns = block.columns.map((col) => {
        const mapped = mapBlockById(col, blockId, fn);
        if (mapped !== col) columnFound = true;
        return mapped;
      });
      if (columnFound) {
        found = true;
        return { ...block, columns };
      }
    }
    return block;
  });
  return found ? next : blocks;
}

/** Reads a zone's current block list. Returns `[]` for an unknown/stale zone id (e.g. a
 * columns block that was since deleted) rather than throwing. A Columns block can live in the
 * body OR be nested inside the header/footer, so its column zones are looked up across all three
 * root trees — not just the body's. */
export function getZoneBlocks(doc: TemplateDocument, zoneId: ZoneId): DocumentBlock[] {
  const parsed = parseZoneId(zoneId);
  if (parsed.region === "body") return doc.blocks;
  if (parsed.region === "header") return doc.header.blocks;
  if (parsed.region === "footer") return doc.footer.blocks;
  const columnsBlock =
    findBlockById(doc.blocks, parsed.blockId!) ??
    findBlockById(doc.header.blocks, parsed.blockId!) ??
    findBlockById(doc.footer.blocks, parsed.blockId!);
  if (columnsBlock?.type === "columns") return columnsBlock.columns[parsed.index!] ?? [];
  return [];
}

export function setZoneBlocks(doc: TemplateDocument, zoneId: ZoneId, blocks: DocumentBlock[]): TemplateDocument {
  const parsed = parseZoneId(zoneId);
  if (parsed.region === "body") return { ...doc, blocks };
  if (parsed.region === "header") return { ...doc, header: { ...doc.header, blocks } };
  if (parsed.region === "footer") return { ...doc, footer: { ...doc.footer, blocks } };
  const setColumn = (block: DocumentBlock): DocumentBlock => {
    if (block.type !== "columns") return block;
    const columns = block.columns.map((col, i) => (i === parsed.index ? blocks : col));
    return { ...block, columns } as ColumnsBlock;
  };
  // Try each root in turn; only the one that actually contains the Columns block changes
  // (mapBlockById is a no-op on the other two, since the id is never found there).
  const body = mapBlockById(doc.blocks, parsed.blockId!, setColumn);
  if (body !== doc.blocks) return { ...doc, blocks: body };
  const headerBlocks = mapBlockById(doc.header.blocks, parsed.blockId!, setColumn);
  if (headerBlocks !== doc.header.blocks) return { ...doc, header: { ...doc.header, blocks: headerBlocks } };
  const footerBlocks = mapBlockById(doc.footer.blocks, parsed.blockId!, setColumn);
  if (footerBlocks !== doc.footer.blocks) return { ...doc, footer: { ...doc.footer, blocks: footerBlocks } };
  return doc;
}

function findBlockById(blocks: DocumentBlock[], blockId: string): DocumentBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.type === "columns") {
      for (const col of block.columns) {
        const found = findBlockById(col, blockId);
        if (found) return found;
      }
    }
  }
  return null;
}

export interface ZoneLocation {
  zoneId: ZoneId;
  index: number;
}

/** Locates a block anywhere in the document (body, header/footer zones, or nested inside any
 * columns block, at any depth) — the one search every zone-aware operation is built on. */
export function findBlockAndZone(doc: TemplateDocument, blockId: string): ZoneLocation | null {
  function search(blocks: DocumentBlock[], zoneId: ZoneId): ZoneLocation | null {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.id === blockId) return { zoneId, index: i };
      if (block.type === "columns") {
        for (let ci = 0; ci < block.columns.length; ci++) {
          const found = search(block.columns[ci], columnsZone(block.id, ci));
          if (found) return found;
        }
      }
    }
    return null;
  }
  return (
    search(doc.blocks, BODY_ZONE) ??
    search(doc.header.blocks, HEADER_ZONE) ??
    search(doc.footer.blocks, FOOTER_ZONE)
  );
}

export function getBlockById(doc: TemplateDocument, blockId: string): DocumentBlock | null {
  const located = findBlockAndZone(doc, blockId);
  if (!located) return null;
  return getZoneBlocks(doc, located.zoneId)[located.index] ?? null;
}

/** Inserts `block` into `zoneId` at `index` (clamped), returning a new document. */
export function insertIntoZone(doc: TemplateDocument, zoneId: ZoneId, index: number, block: DocumentBlock): TemplateDocument {
  const blocks = getZoneBlocks(doc, zoneId);
  const clamped = Math.max(0, Math.min(index, blocks.length));
  const next = [...blocks];
  next.splice(clamped, 0, block);
  return setZoneBlocks(doc, zoneId, next);
}

export function updateBlockAnywhere(doc: TemplateDocument, blockId: string, patch: Partial<DocumentBlock>): TemplateDocument {
  const located = findBlockAndZone(doc, blockId);
  if (!located) return doc;
  const blocks = getZoneBlocks(doc, located.zoneId);
  const next = blocks.map((b, i) => (i === located.index ? ({ ...b, ...patch } as DocumentBlock) : b));
  return setZoneBlocks(doc, located.zoneId, next);
}

export function deleteBlockAnywhere(doc: TemplateDocument, blockId: string): TemplateDocument {
  const located = findBlockAndZone(doc, blockId);
  if (!located) return doc;
  const blocks = getZoneBlocks(doc, located.zoneId).filter((b) => b.id !== blockId);
  return setZoneBlocks(doc, located.zoneId, blocks);
}

export function moveBlockWithinZone(doc: TemplateDocument, blockId: string, direction: "up" | "down"): TemplateDocument {
  const located = findBlockAndZone(doc, blockId);
  if (!located) return doc;
  const blocks = getZoneBlocks(doc, located.zoneId);
  const target = direction === "up" ? located.index - 1 : located.index + 1;
  if (target < 0 || target >= blocks.length) return doc;
  const next = [...blocks];
  [next[located.index], next[target]] = [next[target], next[located.index]];
  return setZoneBlocks(doc, located.zoneId, next);
}

/** Moves an existing block to `targetZoneId` at `targetIndex` — the single operation behind both
 * same-zone reordering and cross-zone drag (e.g. dragging a signature from the body into the
 * footer's right zone). `targetIndex` is resolved against the target zone's blocks *after* the
 * block has been removed from its source zone, so dropping "before block N" behaves the same way
 * whether or not the source and target zone are the same. */
export function moveBlockToZone(doc: TemplateDocument, blockId: string, targetZoneId: ZoneId, targetIndex: number): TemplateDocument {
  const located = findBlockAndZone(doc, blockId);
  if (!located) return doc;
  const block = getZoneBlocks(doc, located.zoneId)[located.index];
  if (!block) return doc;

  let next = setZoneBlocks(doc, located.zoneId, getZoneBlocks(doc, located.zoneId).filter((b) => b.id !== blockId));
  const targetBlocks = getZoneBlocks(next, targetZoneId);
  const clamped = Math.max(0, Math.min(targetIndex, targetBlocks.length));
  const updated = [...targetBlocks];
  updated.splice(clamped, 0, block);
  next = setZoneBlocks(next, targetZoneId, updated);
  return next;
}

export function duplicateBlockInPlace(doc: TemplateDocument, blockId: string, cloneWithNewId: (block: DocumentBlock) => DocumentBlock): TemplateDocument {
  const located = findBlockAndZone(doc, blockId);
  if (!located) return doc;
  const blocks = getZoneBlocks(doc, located.zoneId);
  const clone = cloneWithNewId(blocks[located.index]);
  const next = [...blocks];
  next.splice(located.index + 1, 0, clone);
  return setZoneBlocks(doc, located.zoneId, next);
}

/** Resolves a dnd-kit drop target (`over.id`, either a zone-droppable id or a block id) into a
 * concrete `{ zoneId, index }`, e.g. for the tool panel's drag-to-insert and the canvas's
 * drag-to-reorder/move handlers. `excludeBlockId` (the block being dragged, if any) is filtered
 * out of the target zone's blocks first so its own removal doesn't shift the computed index. */
export function resolveDropTarget(doc: TemplateDocument, overId: string, excludeBlockId?: string): ZoneLocation {
  if (isZoneDroppableId(overId)) {
    const zoneId = zoneIdFromDroppable(overId);
    const blocks = getZoneBlocks(doc, zoneId).filter((b) => b.id !== excludeBlockId);
    return { zoneId, index: blocks.length };
  }
  const located = findBlockAndZone(doc, overId);
  if (!located) return { zoneId: BODY_ZONE, index: getZoneBlocks(doc, BODY_ZONE).length };
  if (excludeBlockId && located.zoneId) {
    const blocks = getZoneBlocks(doc, located.zoneId).filter((b) => b.id !== excludeBlockId);
    const index = blocks.findIndex((b) => b.id === overId);
    return { zoneId: located.zoneId, index: index === -1 ? blocks.length : index };
  }
  return located;
}
