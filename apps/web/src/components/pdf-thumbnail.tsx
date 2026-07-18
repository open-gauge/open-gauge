"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf, renderPageToCanvas } from "@/lib/pdf";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { EyeIcon } from "@/components/icons";

interface PdfThumbnailProps {
  /** Fetches the PDF bytes. Called once on mount (and again if refreshKey changes). */
  fetchPdf: () => Promise<Blob>;
  title: string;
  refreshKey?: unknown;
}

/** A small first-page thumbnail of a PDF, click-to-enlarge into a scrollable modal. */
export function PdfThumbnail({ fetchPdf, title, refreshKey }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPdf(null);
    (async () => {
      const blob = await fetchPdf();
      const buf = await blob.arrayBuffer();
      const doc = await loadPdf(buf);
      if (cancelled) return;
      setPdf(doc);
      if (canvasRef.current) {
        await renderPageToCanvas(doc, 1, canvasRef.current, 0.22);
      }
    })()
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => pdf && setModalOpen(true)}
        disabled={!pdf}
        title={pdf ? `Preview ${title}` : error ? "Failed to render preview" : "Rendering preview…"}
        className="group relative w-11 h-15 shrink-0 rounded-md border border-og-border-md bg-white overflow-hidden flex items-center justify-center transition-shadow disabled:cursor-default enabled:hover:shadow-md enabled:hover:border-og-accent/40"
      >
        {loading && <span className="w-3 h-3 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />}
        {error && <span className="text-[8px] text-red-500 px-1 text-center leading-tight">Failed</span>}
        <canvas ref={canvasRef} className={loading || error ? "hidden" : "max-w-full max-h-full"} />
        {pdf && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all">
            <EyeIcon size={16} className="text-white" />
          </span>
        )}
      </button>
      {modalOpen && pdf && <PdfPreviewModal pdf={pdf} title={title} onClose={() => setModalOpen(false)} />}
    </>
  );
}
