"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AssetProfile, MechanicalRow, PinoutRow } from "@/types/asset";
import type { EditFormState } from "./asset-detail-client";
import {
  uploadAssetPinoutImage,
  deleteAssetPinoutImage,
  uploadAssetMechanicalImage,
  deleteAssetMechanicalImage,
  getAssetProfile,
} from "@/services/asset.service";
import { WireColorPicker } from "@/components/wire-color-picker";
import { NumberInput } from "@/components/number-input";
import { CameraIcon, MapPinIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";

const COMMON_SIGNAL_NAMES = [
  "GND", "VCC", "VDD", "+5V", "+3.3V", "+12V", "-12V",
  "TX", "RX", "SCL", "SDA", "CLK", "CS", "MISO", "MOSI",
  "EN", "RST", "NC", "A+", "A-", "B+", "B-", "SHIELD",
];

const INPUT_CLS =
  "w-full px-2 py-1.5 rounded-md border border-og-border-md text-xs text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:ring-og-accent/40 focus:border-og-accent/60 transition-colors";

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
      <p className="text-xs font-semibold text-og-text uppercase tracking-wide">{title}</p>
    </div>
  );
}

function ImageSlot({
  imageUrl, alt, isEditing, uploading, onUpload, onRemove, onImageClick, overlay,
}: {
  imageUrl: string | null; alt: string; isEditing: boolean; uploading: boolean;
  onUpload: (file: File) => void; onRemove: () => void;
  onImageClick?: () => void; overlay?: React.ReactNode;
}) {
  const t = useTranslations("assets.interface");
  const inputRef = useRef<HTMLInputElement>(null);
  const clickable = !!(onImageClick && imageUrl);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onUpload(file);
  }

  return (
    <div className="relative">
      <div
        onClick={clickable ? onImageClick : undefined}
        className={`relative aspect-square w-full rounded-lg border border-og-border bg-og-surface-alt overflow-hidden flex items-center justify-center ${clickable ? "cursor-pointer" : ""}`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={alt} className="w-full h-full object-contain" />
        ) : (
          <p className="text-xs text-gray-400 px-4 text-center">{t("noImage")}</p>
        )}
        {overlay}
      </div>
      {isEditing && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            title={imageUrl ? t("changeImage") : t("uploadImage")}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-og-action hover:bg-og-action-dark text-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-60">
            <CameraIcon size={13} />
          </button>
          {imageUrl && (
            <button type="button" onClick={onRemove} disabled={uploading} title={t("removeImage")}
              className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm transition-colors disabled:opacity-60">
              <TrashIcon size={13} />
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapping modal
// ---------------------------------------------------------------------------

function MappingModal({
  imageUrl, rows, onChange, onClose, readOnly = false,
}: {
  imageUrl: string; rows: PinoutRow[]; onChange: (rows: PinoutRow[]) => void; onClose: () => void; readOnly?: boolean;
}) {
  const t = useTranslations("assets.interface.mapping");
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  function placeAt(pinNumber: number, xPct: number, yPct: number) {
    onChange(rows.map((r) => (r.pin_number === pinNumber ? { ...r, x: xPct, y: yPct } : r)));
  }

  function clearMapping(pinNumber: number) {
    onChange(rows.map((r) => (r.pin_number === pinNumber ? { ...r, x: null, y: null } : r)));
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly || selectedPin === null || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    placeAt(selectedPin, Math.min(100, Math.max(0, xPct)), Math.min(100, Math.max(0, yPct)));
    setSelectedPin(null);
  }

  function handleMarkerClick(e: React.MouseEvent, pinNumber: number) {
    e.stopPropagation();
    if (readOnly) {
      setSelectedPin((prev) => (prev === pinNumber ? null : pinNumber));
      return;
    }
    if (selectedPin === pinNumber) {
      clearMapping(pinNumber);
      setSelectedPin(null);
    } else {
      setSelectedPin(pinNumber);
    }
  }

  function handleRowClick(pinNumber: number) {
    setSelectedPin((prev) => (prev === pinNumber ? null : pinNumber));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-og-text">{t("title")}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {readOnly ? t("hintView") : selectedPin !== null ? t("hintPlacing", { pin: selectedPin }) : t("hintSelect")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4 p-5 overflow-y-auto">
          {/* Image with markers */}
          <div
            ref={imgRef}
            onClick={handleImageClick}
            className={`relative w-full aspect-square rounded-lg border border-og-border bg-og-surface-alt overflow-hidden ${
              !readOnly && selectedPin !== null ? "cursor-crosshair" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={t("connectorImageAlt")} className="w-full h-full object-contain pointer-events-none" />
            {rows.filter((r) => r.x != null && r.y != null).map((r) => (
              <button
                key={r.pin_number}
                type="button"
                onClick={(e) => handleMarkerClick(e, r.pin_number)}
                style={{ left: `${r.x}%`, top: `${r.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm transition-colors ${
                  selectedPin === r.pin_number
                    ? "bg-red-500 text-white ring-2 ring-white"
                    : "bg-og-accent text-white hover:bg-og-accent-dark"
                }`}
                title={r.signal_name || String(r.pin_number)}
              >
                {r.pin_number}
              </button>
            ))}
          </div>

          {/* Pin list */}
          <div className="divide-y divide-og-border rounded-lg border border-og-border overflow-hidden h-fit">
            {rows.map((r) => {
              const mapped = r.x != null && r.y != null;
              return (
                <button
                  key={r.pin_number}
                  type="button"
                  onClick={() => handleRowClick(r.pin_number)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    selectedPin === r.pin_number ? "bg-og-accent/10" : "hover:bg-og-surface-alt"
                  }`}
                >
                  <span className="shrink-0 w-6 h-6 rounded-full bg-og-border text-og-text text-[10px] font-bold flex items-center justify-center">
                    {r.pin_number}
                  </span>
                  <span className="flex-1 min-w-0 text-xs text-og-text truncate">{r.signal_name || "—"}</span>
                  <span className={`text-[10px] shrink-0 ${mapped ? "text-emerald-500" : "text-gray-400"}`}>
                    {mapped ? t("mapped") : t("unmapped")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-og-border shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors">
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Electrical panel
// ---------------------------------------------------------------------------

interface PanelProps {
  assetId: string;
  profile: AssetProfile;
  isEditing: boolean;
  form: EditFormState | null;
  onChange: (form: EditFormState) => void;
  onProfileUpdate: (p: AssetProfile) => void;
}

function ElectricalPanel({ assetId, profile, isEditing, form, onChange, onProfileUpdate }: PanelProps) {
  const t = useTranslations("assets.interface");
  const datalistId = `signal-names-${assetId}`;
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingReadOnly, setMappingReadOnly] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<number | null>(null);

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      await uploadAssetPinoutImage(assetId, file);
      onProfileUpdate(await getAssetProfile(assetId));
    } catch (e) {
      setImageError(e instanceof Error ? e.message : t("imageUploadFailed"));
    } finally {
      setImageUploading(false);
    }
  }

  async function handleImageRemove() {
    setImageUploading(true);
    try {
      await deleteAssetPinoutImage(assetId);
      onProfileUpdate(await getAssetProfile(assetId));
    } catch (e) {
      setImageError(e instanceof Error ? e.message : t("imageUploadFailed"));
    } finally {
      setImageUploading(false);
    }
  }

  function addRow() {
    if (!form) return;
    const nextPin = form.pinout_table.length > 0 ? Math.max(...form.pinout_table.map((r) => r.pin_number)) + 1 : 1;
    onChange({ ...form, pinout_table: [...form.pinout_table, { pin_number: nextPin, signal_name: "", wire_colors: null, description: "", x: null, y: null }] });
  }

  function updateRow(i: number, row: PinoutRow) {
    if (!form) return;
    const next = [...form.pinout_table];
    next[i] = row;
    onChange({ ...form, pinout_table: next });
  }

  function removeRow(i: number) {
    if (!form) return;
    onChange({ ...form, pinout_table: form.pinout_table.filter((_, j) => j !== i) });
  }

  function setMappingRows(rows: PinoutRow[]) {
    if (!form) return;
    onChange({ ...form, pinout_table: rows });
  }

  const rows = isEditing && form ? form.pinout_table : (profile.pinout_table ?? []);
  const hasRows = rows.length > 0;
  const hoveredRow = !isEditing && hoveredPin != null ? rows.find((r) => r.pin_number === hoveredPin) : undefined;
  const hoverMarker = hoveredRow && hoveredRow.x != null && hoveredRow.y != null ? (
    <div
      style={{ left: `${hoveredRow.x}%`, top: `${hoveredRow.y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm ring-2 ring-white pointer-events-none"
    >
      {hoveredRow.pin_number}
    </div>
  ) : null;

  function openMapping(readOnly: boolean) {
    setMappingReadOnly(readOnly);
    setMappingOpen(true);
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <PanelHeader title={t("electrical")} />
      <div className="p-4">
        {imageError && (
          <p className="mb-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
            {imageError}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          {/* Connector image + mapping */}
          <div>
            <ImageSlot
              imageUrl={profile.pinout_image_url} alt={t("connectorImageAlt")}
              isEditing={isEditing} uploading={imageUploading}
              onUpload={handleImageUpload} onRemove={handleImageRemove}
              onImageClick={!isEditing && hasRows ? () => openMapping(true) : undefined}
              overlay={hoverMarker}
            />
            {isEditing && profile.pinout_image_url && hasRows && (
              <button type="button" onClick={() => openMapping(false)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-og-accent border border-og-accent/30 rounded-lg hover:bg-og-accent/10 transition-colors">
                <MapPinIcon size={12} />{t("mappingButton")}
              </button>
            )}
          </div>

          {/* Pinout table */}
          <div>
            <datalist id={datalistId}>
              {COMMON_SIGNAL_NAMES.map((name) => <option key={name} value={name} />)}
            </datalist>
            {!hasRows && !isEditing ? (
              <p className="text-xs text-gray-400 py-4">{t("noPinout")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-og-border">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-og-border bg-og-surface-alt">
                      <th className="px-2 py-2 font-semibold text-gray-400 w-14">{t("pin")}</th>
                      <th className="px-2 py-2 font-semibold text-gray-400 w-16">{t("wireColor")}</th>
                      <th className="px-2 py-2 font-semibold text-gray-400 w-32">{t("signalName")}</th>
                      <th className="px-2 py-2 font-semibold text-gray-400">{t("description")}</th>
                      {isEditing && <th className="px-2 py-2 w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-og-border">
                    {rows.map((row, i) => (
                      <tr key={i}
                        onMouseEnter={!isEditing ? () => setHoveredPin(row.pin_number) : undefined}
                        onMouseLeave={!isEditing ? () => setHoveredPin(null) : undefined}
                        className={!isEditing ? "hover:bg-og-surface-alt transition-colors" : undefined}
                      >
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <NumberInput value={String(row.pin_number)}
                              onChange={(v) => updateRow(i, { ...row, pin_number: parseInt(v, 10) || 0 })}
                              className="w-16 font-mono" />
                          ) : (
                            <span className="font-mono text-og-text">{row.pin_number}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <WireColorPicker
                            value={row.wire_colors}
                            disabled={!isEditing}
                            onChange={(colors) => updateRow(i, { ...row, wire_colors: colors })}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <input type="text" list={datalistId} value={row.signal_name}
                              onChange={(e) => updateRow(i, { ...row, signal_name: e.target.value })}
                              placeholder={t("signalNamePlaceholder")} className={INPUT_CLS} />
                          ) : (
                            <span className="text-og-text">{row.signal_name || "—"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <textarea value={row.description} rows={1}
                              onChange={(e) => updateRow(i, { ...row, description: e.target.value })}
                              placeholder={t("descriptionPlaceholder")} className={`${INPUT_CLS} resize-y min-h-8`} />
                          ) : (
                            <span className="text-gray-400">{row.description || "—"}</span>
                          )}
                        </td>
                        {isEditing && (
                          <td className="px-2 py-1.5 align-top">
                            <button type="button" onClick={() => removeRow(i)}
                              className="p-1 rounded-sm text-gray-400 hover:text-red-500 hover:bg-og-surface-alt transition-colors">
                              <TrashIcon size={12} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isEditing && (
              <button type="button" onClick={addRow}
                className="mt-2 flex items-center gap-1.5 text-xs text-og-accent hover:text-og-accent-dark transition-colors">
                <PlusIcon size={11} />{t("addPin")}
              </button>
            )}
          </div>
        </div>
      </div>

      {mappingOpen && profile.pinout_image_url && (
        <MappingModal
          imageUrl={profile.pinout_image_url}
          rows={rows}
          onChange={isEditing && form ? setMappingRows : () => {}}
          onClose={() => setMappingOpen(false)}
          readOnly={mappingReadOnly}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mechanical panel
// ---------------------------------------------------------------------------

function MechanicalPanel({ assetId, profile, isEditing, form, onChange, onProfileUpdate }: PanelProps) {
  const t = useTranslations("assets.interface");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      await uploadAssetMechanicalImage(assetId, file);
      onProfileUpdate(await getAssetProfile(assetId));
    } catch (e) {
      setImageError(e instanceof Error ? e.message : t("imageUploadFailed"));
    } finally {
      setImageUploading(false);
    }
  }

  async function handleImageRemove() {
    setImageUploading(true);
    try {
      await deleteAssetMechanicalImage(assetId);
      onProfileUpdate(await getAssetProfile(assetId));
    } catch (e) {
      setImageError(e instanceof Error ? e.message : t("imageUploadFailed"));
    } finally {
      setImageUploading(false);
    }
  }

  function addRow() {
    if (!form) return;
    onChange({ ...form, mechanical_table: [...form.mechanical_table, { point_label: "", type: "", torque_spec: "", description: "" }] });
  }

  function updateRow(i: number, row: MechanicalRow) {
    if (!form) return;
    const next = [...form.mechanical_table];
    next[i] = row;
    onChange({ ...form, mechanical_table: next });
  }

  function removeRow(i: number) {
    if (!form) return;
    onChange({ ...form, mechanical_table: form.mechanical_table.filter((_, j) => j !== i) });
  }

  const rows = isEditing && form ? form.mechanical_table : (profile.mechanical_table ?? []);
  const hasRows = rows.length > 0;

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <PanelHeader title={t("mechanical")} />
      <div className="p-4">
        {imageError && (
          <p className="mb-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
            {imageError}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          <ImageSlot
            imageUrl={profile.mechanical_image_url} alt={t("mechanicalImageAlt")}
            isEditing={isEditing} uploading={imageUploading}
            onUpload={handleImageUpload} onRemove={handleImageRemove}
          />

          <div>
            {!hasRows && !isEditing ? (
              <p className="text-xs text-gray-400 py-4">{t("noMechanical")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-og-border">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-og-border bg-og-surface-alt">
                      <th className="px-2 py-2 font-semibold text-gray-400 w-28">{t("pointLabel")}</th>
                      <th className="px-2 py-2 font-semibold text-gray-400 w-24">{t("type")}</th>
                      <th className="px-2 py-2 font-semibold text-gray-400 w-28">{t("torqueSpec")}</th>
                      <th className="px-2 py-2 font-semibold text-gray-400">{t("description")}</th>
                      {isEditing && <th className="px-2 py-2 w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-og-border">
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <input type="text" value={row.point_label}
                              onChange={(e) => updateRow(i, { ...row, point_label: e.target.value })}
                              placeholder={t("pointLabelPlaceholder")} className={INPUT_CLS} />
                          ) : (
                            <span className="font-mono text-og-text">{row.point_label}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <input type="text" value={row.type}
                              onChange={(e) => updateRow(i, { ...row, type: e.target.value })}
                              placeholder={t("typePlaceholder")} className={INPUT_CLS} />
                          ) : (
                            <span className="text-og-text">{row.type || "—"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <input type="text" value={row.torque_spec}
                              onChange={(e) => updateRow(i, { ...row, torque_spec: e.target.value })}
                              placeholder={t("torqueSpecPlaceholder")} className={INPUT_CLS} />
                          ) : (
                            <span className="text-og-text">{row.torque_spec || "—"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {isEditing ? (
                            <textarea value={row.description} rows={1}
                              onChange={(e) => updateRow(i, { ...row, description: e.target.value })}
                              placeholder={t("descriptionPlaceholder")} className={`${INPUT_CLS} resize-y min-h-8`} />
                          ) : (
                            <span className="text-gray-400">{row.description || "—"}</span>
                          )}
                        </td>
                        {isEditing && (
                          <td className="px-2 py-1.5 align-top">
                            <button type="button" onClick={() => removeRow(i)}
                              className="p-1 rounded-sm text-gray-400 hover:text-red-500 hover:bg-og-surface-alt transition-colors">
                              <TrashIcon size={12} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isEditing && (
              <button type="button" onClick={addRow}
                className="mt-2 flex items-center gap-1.5 text-xs text-og-accent hover:text-og-accent-dark transition-colors">
                <PlusIcon size={11} />{t("addPoint")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

interface InterfaceTabProps {
  assetId: string;
  profile: AssetProfile;
  isEditing: boolean;
  form: EditFormState | null;
  onChange: (form: EditFormState) => void;
  onProfileUpdate: (p: AssetProfile) => void;
}

/** Interface tab — electrical (connector image + pinout + mapping) and
 * mechanical (drawing + mounting points) panels. Editing is driven entirely
 * by the page's own Edit/Save/Cancel (in the header above) — pinout_table
 * and mechanical_table are just two more fields on the shared edit form,
 * same as every Overview field. Only image upload/removal is immediate
 * (matching the asset picture), independent of Save. */
export function InterfaceTab({ assetId, profile, isEditing, form, onChange, onProfileUpdate }: InterfaceTabProps) {
  return (
    <div className="space-y-4">
      <ElectricalPanel assetId={assetId} profile={profile} isEditing={isEditing} form={form} onChange={onChange} onProfileUpdate={onProfileUpdate} />
      <MechanicalPanel assetId={assetId} profile={profile} isEditing={isEditing} form={form} onChange={onChange} onProfileUpdate={onProfileUpdate} />
    </div>
  );
}
