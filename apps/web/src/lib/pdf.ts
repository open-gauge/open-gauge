"use client";

/**
 * Client-side PDF rendering via pdf.js (the same engine Firefox's built-in
 * PDF viewer uses). Certificates are rendered to a <canvas> here rather than
 * shown via <iframe src="blob:...">/<embed> — relying on the browser's
 * native PDF viewer plugin is unreliable (it depends on per-browser/per-user
 * settings such as Chrome's "Download PDFs instead of opening" toggle), so
 * this renders pixels directly and works the same everywhere.
 */
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

let workerConfigured = false;

function ensureWorker(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  ensureWorker();
  return pdfjsLib.getDocument({ data }).promise;
}

export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
}
