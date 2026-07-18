"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageToCanvas } from "@/lib/pdf";
import { DownloadIcon, XIcon } from "@/components/icons";

interface PdfPreviewModalProps {
  pdf: PDFDocumentProxy;
  title: string;
  onClose: () => void;
}

/** Fullscreen scrollable modal rendering every page of a PDF via pdf.js canvases, with a Download action. */
export function PdfPreviewModal({ pdf, title, onClose }: PdfPreviewModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    const data = await pdf.getData();
    const blob = new Blob([data as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9-_]+/gi, "_") || "certificate"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-6"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border shrink-0">
          <h2 className="text-sm font-semibold text-og-text truncate">{title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
            >
              <DownloadIcon size={12} /> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-sm hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors"
            >
              <XIcon size={15} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-og-surface-alt p-4 space-y-4">
          {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((pageNumber) => (
            <PdfPage key={pageNumber} pdf={pdf} pageNumber={pageNumber} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PdfPage({ pdf, pageNumber }: { pdf: PDFDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderPageToCanvas(pdf, pageNumber, canvasRef.current, 1.4);
    }
  }, [pdf, pageNumber]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-auto rounded-lg border border-og-border shadow-sm bg-white mx-auto block"
    />
  );
}
