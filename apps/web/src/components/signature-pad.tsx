"use client";

import { useRef, useState } from "react";
import { CheckIcon, EraserIcon, TrashIcon, UndoIcon, XIcon } from "@/components/icons";

interface SignaturePadProps {
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

const WIDTH = 480;
const HEIGHT = 180;
const PEN_WIDTH = 2.5;
const ERASER_WIDTH = 16;

/** Mouse/touch/pen drawing pad. Exports strokes as a transparent-background PNG blob. */
export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isErasing, setIsErasing] = useState(false);
  // Snapshot of the canvas taken before each stroke starts, so "Undo" can restore
  // it regardless of whether the stroke drew ink or erased it.
  const [history, setHistory] = useState<ImageData[]>([]);

  function getContext(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // The canvas's CSS size (rect.width/height, via w-full h-auto) can differ from its
    // drawing-surface resolution (canvas.width/height) — scale client coords into canvas space.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  /** Alpha-channel scan — reflects the true canvas contents after either drawing or erasing. */
  function refreshIsEmpty() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) {
        setIsEmpty(false);
        return;
      }
    }
    setIsEmpty(true);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    setHistory((h) => [...h, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
    ctx.strokeStyle = "#151f28";
    ctx.lineWidth = isErasing ? ERASER_WIDTH : PEN_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    refreshIsEmpty();
  }

  function handleUndo() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx || history.length === 0) return;
    ctx.putImageData(history[history.length - 1], 0, 0);
    setHistory((h) => h.slice(0, -1));
    refreshIsEmpty();
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    setHistory([]);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Canvas background is transparent by default — never paint a fill rect here.
    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/png");
  }

  return (
    <div className="space-y-3">
      {/* Fixed white, not bg-og-surface-alt — the canvas itself stays transparent
          (its exported PNG must remain transparent-background), but the ink is a
          fixed dark navy, so it needs a fixed light backdrop to stay visible in
          dark mode instead of going dark-on-near-black. Same reasoning as the
          PDF thumbnail's bg-white: this surface always represents "paper". */}
      <div className="rounded-lg border border-dashed border-og-border-md bg-white overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className={`w-full h-auto touch-none ${isErasing ? "cursor-cell" : "cursor-crosshair"}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsErasing((v) => !v)}
            aria-pressed={isErasing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
              isErasing
                ? "bg-og-accent/10 border-og-accent text-og-accent"
                : "text-gray-600 dark:text-gray-300 border-og-border-md hover:bg-og-surface-alt"
            }`}
          >
            <EraserIcon size={12} /> Erase
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
          >
            <UndoIcon size={12} /> Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={isEmpty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
          >
            <TrashIcon size={12} /> Clear
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
          >
            <XIcon size={12} /> Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isEmpty}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <CheckIcon size={12} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
