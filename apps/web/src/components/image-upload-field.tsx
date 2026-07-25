"use client";

import { useRef, useState } from "react";
import { CameraIcon, TrashIcon } from "@/components/icons";
import { ImagePreviewModal } from "@/components/image-preview-modal";

interface ImageUploadFieldProps {
  imageUrl: string | null;
  alt: string;
  editable: boolean;
  size?: number;
  uploading?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  previewTitle?: string;
  children: React.ReactNode;
}

/**
 * Circular picture with click-to-preview and, when `editable`, two overlaid
 * round buttons (upload/remove) — the shared chrome behind the asset
 * picture, organization logo, and user profile picture. The visual content
 * (image, initials, fallback icon) is supplied by the caller as `children`
 * so each field keeps its own fallback treatment.
 */
export function ImageUploadField({
  imageUrl,
  alt,
  editable,
  size = 80,
  uploading = false,
  onUpload,
  onRemove,
  previewTitle,
  children,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onUpload(file);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => imageUrl && setPreviewOpen(true)}
        disabled={!imageUrl}
        style={{ width: size, height: size }}
        className="rounded-full overflow-hidden disabled:cursor-default"
      >
        {children}
      </button>
      {editable && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title={imageUrl ? "Change picture" : "Upload picture"}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-og-action hover:bg-og-action-dark text-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-60"
          >
            <CameraIcon size={13} />
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading}
              title="Remove picture"
              className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-60"
            >
              <TrashIcon size={13} />
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </>
      )}

      {previewOpen && imageUrl && (
        <ImagePreviewModal
          src={imageUrl}
          alt={alt}
          title={previewTitle ?? alt}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
