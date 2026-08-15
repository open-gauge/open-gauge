"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StoredFile } from "@/types/stored_file";
import { listAssetCadFiles, uploadAssetCadFile, deleteAssetCadFile } from "@/services/asset.service";
import { CadViewer } from "@/components/cad-viewer";
import { CubeIcon, DownloadIcon, TrashIcon, UploadCloudIcon } from "@/components/icons";

const CAD_ACCEPT = ".stl,.step,.stp,.iges,.igs,.brep";

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CadTabProps {
  assetId: string;
  canEdit: boolean;
}

/** CAD tab — upload/list/download CAD files, with a live 3D preview for the
 * selected one (STL rendered directly, STEP/IGES/BREP via occt-import-js). */
export function CadTab({ assetId, canEdit }: CadTabProps) {
  const t = useTranslations("assets.cad");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listAssetCadFiles(assetId)
      .then((data) => {
        setFiles(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .finally(() => setLoading(false));
  }, [assetId]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadAssetCadFile(assetId, file);
      setFiles((prev) => [...prev, uploaded]);
      setSelectedId(uploaded.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t("errorUpload"));
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (canEdit) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!canEdit) return;
    const file = e.dataTransfer.files[0];
    if (file) await handleUpload(file);
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await handleUpload(file);
    e.target.value = "";
  }

  async function handleDelete(fileId: string) {
    try {
      await deleteAssetCadFile(assetId, fileId);
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        setSelectedId((sel) => (sel === fileId ? (next[0]?.id ?? null) : sel));
        return next;
      });
    } catch {
      // silent — file may already be gone
    }
  }

  const selected = files.find((f) => f.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="w-6 h-6 border-2 border-og-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer
            ${isDragging ? "border-og-accent bg-og-accent/5" : "border-og-border hover:border-og-accent/50 hover:bg-og-surface-alt"}`}
        >
          <UploadCloudIcon size={22} className={isDragging ? "text-og-accent" : "text-gray-400"} />
          <p className="text-sm text-gray-500">{uploading ? t("uploading") : t("dropHint")}</p>
          <p className="text-xs text-gray-400">{t("supportedTypes")}</p>
          <input ref={fileInputRef} type="file" accept={CAD_ACCEPT} className="hidden" onChange={handleFileInput} />
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <CubeIcon size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* File list */}
          <div className="lg:col-span-1 divide-y divide-og-border rounded-lg border border-og-border overflow-hidden">
            {files.map((f) => (
              <div
                key={f.id}
                onClick={() => setSelectedId(f.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                  selectedId === f.id ? "bg-og-accent/10" : "hover:bg-og-surface-alt"
                }`}
              >
                <CubeIcon size={16} className={selectedId === f.id ? "text-og-accent" : "text-gray-400"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-og-text truncate">{f.original_filename}</p>
                  <p className="text-xs text-gray-400">{fmtBytes(f.size_bytes)}</p>
                </div>
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-sm hover:bg-og-surface text-gray-400 hover:text-og-text transition-colors shrink-0"
                    title={t("download")}
                  >
                    <DownloadIcon size={13} />
                  </a>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(f.id); }}
                    className="p-1.5 rounded-sm hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    title={t("removeFile")}
                  >
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Viewer */}
          <div className="lg:col-span-2 bg-og-surface-alt rounded-lg border border-og-border h-[420px] overflow-hidden">
            {selected?.url ? (
              <CadViewer key={selected.id} url={selected.url} filename={selected.original_filename} className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">{t("selectToPreview")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
