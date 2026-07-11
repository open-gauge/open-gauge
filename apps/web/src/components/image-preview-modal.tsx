"use client";

import { useRef } from "react";
import { XIcon } from "@/components/icons";

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  title?: string;
  onClose: () => void;
}

/** Fullscreen backdrop modal for viewing a picture (profile/asset) in detail. */
export function ImagePreviewModal({ src, alt, title, onClose }: ImagePreviewModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text truncate">{title ?? "Image"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors shrink-0"
          >
            <XIcon size={15} />
          </button>
        </div>
        <div className="p-5 flex items-center justify-center bg-og-surface-alt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[70vh] max-w-full object-contain rounded-lg" />
        </div>
      </div>
    </div>
  );
}
