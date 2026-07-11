"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CopyIcon,
  DocumentIcon,
  EditIcon,
  PaperclipIcon,
  PlusIcon,
  PrinterIcon,
  ProceduresIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import {
  createProcedure,
  deleteProcedure,
  deleteProcedureFile,
  listProcedureFiles,
  listProcedures,
  updateProcedure,
  uploadProcedureStepFile,
} from "@/services/procedure.service";
import type {
  Procedure,
  ProcedureAcceptanceCriterion,
  ProcedureCreateBody,
  ProcedureEnvironmentItem,
  ProcedureEquipmentItem,
  ProcedureMaterialItem,
  ProcedureStep,
} from "@/types/procedure";
import type { StoredFile } from "@/types/stored_file";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHYSICAL_QUANTITIES = [
  "pressure", "temperature", "humidity", "flow", "level",
  "electrical", "force", "vibration", "displacement", "torque",
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg border border-mar-border-md text-sm text-mar-text bg-mar-surface focus:outline-hidden focus:ring-1 focus:ring-mar-accent/40 focus:border-mar-accent/60 transition-colors placeholder-gray-400";

const DURATION_UNITS = ["seconds", "minutes", "hours", "days"] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
const UNIT_TO_MIN: Record<DurationUnit, number> = {
  seconds: 1 / 60,
  minutes: 1,
  hours: 60,
  days: 1440,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function bestUnit(minutes: number | null): DurationUnit {
  if (!minutes || minutes <= 0) return "minutes";
  if (minutes % 1440 === 0) return "days";
  if (minutes % 60 === 0) return "hours";
  if (minutes < 1) return "seconds";
  return "minutes";
}

function formatDuration(totalMin: number | null): string | null {
  if (!totalMin || totalMin <= 0) return null;
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = Math.floor(totalMin % 60);
  const s = Math.round((totalMin % 1) * 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && d === 0 && h === 0) parts.push(`${s}s`);
  return parts.length ? parts.join(" ") : null;
}

function buildUpdateBody(proc: Procedure): Partial<ProcedureCreateBody> {
  const totalDuration = (proc.steps ?? []).reduce(
    (sum, s) => sum + (s.duration_min ?? 0),
    0,
  );
  return {
    proc_id: proc.proc_id ?? undefined,
    name: proc.name,
    description: proc.description || null,
    version: proc.version,
    difficulty: proc.difficulty,
    author: proc.author || null,
    standard_ref: proc.standard_ref || null,
    duration_min: totalDuration > 0 ? Math.round(totalDuration) : null,
    physical_quantity: proc.physical_quantity,
    tags: proc.tags,
    steps: (proc.steps ?? []).map((s) => ({
      title: s.title,
      description: s.description,
      duration_min: s.duration_min,
    })),
    equipment: proc.equipment,
    materials: proc.materials,
    environment: proc.environment,
    safety_notes: proc.safety_notes,
    acceptance_criteria: proc.acceptance_criteria,
  };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  );
}

function MetaCell({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-xs text-mar-text">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar list item
// ---------------------------------------------------------------------------

function ProcedureListItem({ proc, active, onClick }: { proc: Procedure; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-start gap-3 ${
        active ? "bg-mar-accent/10 dark:bg-white/10" : "hover:bg-mar-surface-alt"
      }`}
    >
      <div
        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5 ${
          active ? "bg-mar-accent/20 text-mar-accent" : "bg-mar-border text-gray-400"
        }`}
      >
        <ProceduresIcon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-mono font-semibold ${active ? "text-mar-accent" : "text-gray-400"}`}>
            {proc.proc_id ?? "—"}
          </span>
        </div>
        <p className="text-xs font-medium leading-snug truncate text-mar-text">{proc.name}</p>
        <div className="flex items-center gap-2 mt-1">
          {proc.duration_min != null && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <ClockIcon size={10} />
              {formatDuration(proc.duration_min) ?? `${proc.duration_min} min`}
            </span>
          )}
          <span className="text-[10px] text-gray-400">v{proc.version}</span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Delete procedure confirmation
// ---------------------------------------------------------------------------

function DeleteProcedureModal({ procName, onConfirm, onClose }: {
  procName: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove procedure");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
            <TrashIcon size={16} className="text-red-500" />
          </div>
          <h2 className="text-sm font-semibold text-mar-text">Remove procedure?</h2>
        </div>
        <p className="text-sm text-gray-400 mb-2">
          <span className="font-medium text-mar-text">{procName}</span> will be deactivated and removed from the procedures list.
        </p>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} disabled={deleting}
            className="px-3 py-1.5 text-sm border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors text-mar-text disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={deleting} onClick={handleConfirm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {deleting ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <TrashIcon size={14} />}
            {deleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-8 cursor-zoom-out" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Attachment preview" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
        <XIcon size={18} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step file chip
// ---------------------------------------------------------------------------

function StepFileChip({ file, isEditing, onDelete, onImageClick }: {
  file: StoredFile; isEditing: boolean; onDelete: () => void; onImageClick: (url: string) => void;
}) {
  const isImage = file.content_type.startsWith("image/");
  if (isImage && file.url) {
    return (
      <div className="relative group">
        <button type="button" onClick={() => onImageClick(file.url!)}
          className="w-14 h-14 rounded-lg border border-mar-border overflow-hidden hover:ring-2 hover:ring-mar-accent/50 transition-all block" title={file.original_filename}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.url} alt={file.original_filename} className="w-full h-full object-cover" />
        </button>
        {isEditing && (
          <button type="button" onClick={onDelete}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
            <XIcon size={8} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-1.5 px-2 py-1 bg-mar-surface-alt border border-mar-border rounded-lg text-[11px]">
      <DocumentIcon size={11} className="text-gray-400 shrink-0" />
      {file.url ? (
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-mar-accent hover:underline truncate max-w-[160px]">{file.original_filename}</a>
      ) : (
        <span className="text-mar-text truncate max-w-[160px]">{file.original_filename}</span>
      )}
      {isEditing && (
        <button type="button" onClick={onDelete} className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"><XIcon size={10} /></button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step editor row
// ---------------------------------------------------------------------------

function StepEditorRow({ step, index, total, onChange, onRemove, onMoveUp, onMoveDown }: {
  step: ProcedureStep; index: number; total: number;
  onChange: (s: ProcedureStep) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [durUnit, setDurUnit] = useState<DurationUnit>(() => bestUnit(step.duration_min));

  const displayDurValue = step.duration_min != null
    ? +(step.duration_min / UNIT_TO_MIN[durUnit]).toFixed(4)
    : "";

  function handleDurChange(val: string) {
    const num = parseFloat(val);
    const mins = isNaN(num) || val === "" ? null : num * UNIT_TO_MIN[durUnit];
    onChange({ ...step, duration_min: mins });
  }

  const LABEL_CLS = "w-24 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-gray-400";

  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b border-mar-border last:border-0">
      {/* Step number */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-mar-accent/10 text-mar-accent flex items-center justify-center text-xs font-bold mt-1">
        {String(index + 1).padStart(2, "0")}
      </div>

      {/* Labeled fields */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-3">
          <span className={LABEL_CLS}>Title</span>
          <input type="text" value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })}
            placeholder="Step title" className={`${INPUT_CLS} flex-1`} />
        </div>
        <div className="flex items-start gap-3">
          <span className={`${LABEL_CLS} pt-2`}>Description</span>
          <textarea value={step.description ?? ""} onChange={(e) => onChange({ ...step, description: e.target.value || null })}
            placeholder="Optional description" rows={2} className={`${INPUT_CLS} flex-1 resize-none`} />
        </div>
        <div className="flex items-center gap-3">
          <span className={LABEL_CLS}>Duration</span>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={9999} step="any" value={displayDurValue}
              onChange={(e) => handleDurChange(e.target.value)}
              placeholder="0" className={`${INPUT_CLS} w-24`} />
            <select value={durUnit} onChange={(e) => setDurUnit(e.target.value as DurationUnit)}
              className={`${INPUT_CLS} w-32`}>
              {DURATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-1 shrink-0 mt-1">
        <button type="button" onClick={onMoveUp} disabled={index === 0}
          className="p-1 rounded-sm text-gray-400 hover:text-mar-text hover:bg-mar-surface-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
          <ChevronUpIcon size={14} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1}
          className="p-1 rounded-sm text-gray-400 hover:text-mar-text hover:bg-mar-surface-alt transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
          <ChevronDownIcon size={14} />
        </button>
        <button type="button" onClick={onRemove}
          className="p-1 rounded-sm text-red-400 hover:text-red-500 hover:bg-mar-surface-alt transition-colors" title="Remove step">
          <TrashIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline list editors (equipment / materials / environment / safety / criteria)
// ---------------------------------------------------------------------------

function TwoColListEditor<T>({ items, col1Label, col2Label, col1Key, col2Key, col2Optional,
  onAdd, onUpdate, onRemove, addLabel }: {
  items: T[]; col1Label: string; col2Label: string;
  col1Key: keyof T; col2Key: keyof T; col2Optional?: boolean;
  onAdd: () => void; onUpdate: (i: number, item: T) => void; onRemove: (i: number) => void;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-1">
          <span>{col1Label}</span><span>{col2Label}</span><span />
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <input type="text" value={String(item[col1Key] ?? "")}
            onChange={(e) => onUpdate(i, { ...item, [col1Key]: e.target.value })}
            placeholder={col1Label} className={INPUT_CLS} />
          <input type="text" value={String(item[col2Key] ?? "")}
            onChange={(e) => onUpdate(i, { ...item, [col2Key]: e.target.value || (col2Optional ? null : "") })}
            placeholder={col2Optional ? `${col2Label} (opt.)` : col2Label} className={INPUT_CLS} />
          <button type="button" onClick={() => onRemove(i)}
            className="p-1.5 rounded-sm text-gray-400 hover:text-red-500 hover:bg-mar-surface-alt transition-colors">
            <TrashIcon size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd}
        className="flex items-center gap-1.5 text-xs text-mar-accent hover:text-mar-accent-dark transition-colors mt-1">
        <PlusIcon size={11} />{addLabel}
      </button>
    </div>
  );
}

function SafetyEditor({ notes, onAdd, onUpdate, onRemove }: {
  notes: string[]; onAdd: () => void; onUpdate: (i: number, v: string) => void; onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      {notes.map((note, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <input type="text" value={note} onChange={(e) => onUpdate(i, e.target.value)}
            placeholder="Safety note" className={`${INPUT_CLS} flex-1`} />
          <button type="button" onClick={() => onRemove(i)}
            className="p-1.5 rounded-sm text-gray-400 hover:text-red-500 hover:bg-mar-surface-alt transition-colors">
            <TrashIcon size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd}
        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity mt-1">
        <PlusIcon size={11} />Add note
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Procedure detail
// ---------------------------------------------------------------------------

interface ProcedureDetailProps {
  proc: Procedure;
  initialEditing?: boolean;
  onSaved: (updated: Procedure) => void;
  onDeleted: (procId: string) => void;
}

function ProcedureDetail({ proc, initialEditing = false, onSaved, onDeleted }: ProcedureDetailProps) {
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [draft, setDraft] = useState<Procedure>(() => deepCopy(proc));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState(() => (proc.tags ?? []).join(", "));

  // Stable keys for step components so reordering doesn't lose internal state
  const nextKeyRef = useRef(0);
  const [stepKeys, setStepKeys] = useState<number[]>(
    () => (proc.steps ?? []).map(() => nextKeyRef.current++),
  );

  const [stepFiles, setStepFiles] = useState<StoredFile[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingStepRef = useRef<number | null>(null);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    setStepFiles([]);
    listProcedureFiles(proc.id).then(setStepFiles).catch(() => {});
  }, [proc.id]);

  // --- Edit actions ---
  function handleStartEdit() {
    setDraft(deepCopy(proc));
    setStepKeys((proc.steps ?? []).map(() => nextKeyRef.current++));
    setTagsInput((proc.tags ?? []).join(", "));
    setIsEditing(true);
    setSaveError(null);
  }

  function handleCancel() {
    setDraft(deepCopy(proc));
    setStepKeys((proc.steps ?? []).map(() => nextKeyRef.current++));
    setTagsInput((proc.tags ?? []).join(", "));
    setIsEditing(false);
    setSaveError(null);
  }

  async function handleSave() {
    if (!draft.proc_id?.trim()) { setSaveError("Procedure ID is required"); return; }
    if (!draft.name.trim()) { setSaveError("Name is required"); return; }
    // Flush any pending tags still in the text box
    const pendingTags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const finalDraft = { ...draft, tags: pendingTags.length > 0 ? pendingTags : null };
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProcedure(finalDraft.id, buildUpdateBody(finalDraft));
      setDraft(updated);
      setTagsInput((updated.tags ?? []).join(", "));
      setIsEditing(false);
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProcedure() {
    await deleteProcedure(proc.id);
    onDeleted(proc.id);
  }

  // --- Draft helpers ---
  function setDraftField<K extends keyof Procedure>(key: K, value: Procedure[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // --- Step mutations ---
  function updateStep(i: number, step: ProcedureStep) {
    const steps = [...(draft.steps ?? [])];
    steps[i] = step;
    setDraftField("steps", steps);
  }

  function addStep() {
    setDraftField("steps", [...(draft.steps ?? []), { title: "", description: null, duration_min: null }]);
    setStepKeys((prev) => [...prev, nextKeyRef.current++]);
  }

  function removeStep(i: number) {
    setDraftField("steps", (draft.steps ?? []).filter((_, j) => j !== i));
    setStepKeys((prev) => prev.filter((_, j) => j !== i));
    // Shift file indices down for steps after the removed one
    setStepFiles((prev) => prev
      .filter((f) => f.step_index !== i)
      .map((f) => f.step_index != null && f.step_index > i ? { ...f, step_index: f.step_index - 1 } : f)
    );
  }

  function moveStep(i: number, dir: -1 | 1) {
    const steps = [...(draft.steps ?? [])];
    const target = i + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[i], steps[target]] = [steps[target], steps[i]];
    setDraftField("steps", steps);
    // Swap step keys so components follow their step
    setStepKeys((prev) => {
      const keys = [...prev];
      [keys[i], keys[target]] = [keys[target], keys[i]];
      return keys;
    });
    // Remap stepFiles so attachments follow their step
    setStepFiles((prev) =>
      prev.map((f) => {
        if (f.step_index === i) return { ...f, step_index: target };
        if (f.step_index === target) return { ...f, step_index: i };
        return f;
      }),
    );
  }

  // --- Equipment mutations ---
  function addEquipment() { setDraftField("equipment", [...(draft.equipment ?? []), { name: "", model: null }]); }
  function updateEquipment(i: number, item: ProcedureEquipmentItem) {
    const eq = [...(draft.equipment ?? [])]; eq[i] = item; setDraftField("equipment", eq);
  }
  function removeEquipment(i: number) { setDraftField("equipment", (draft.equipment ?? []).filter((_, j) => j !== i)); }

  // --- Materials mutations ---
  function addMaterial() { setDraftField("materials", [...(draft.materials ?? []), { name: "", quantity: null }]); }
  function updateMaterial(i: number, item: ProcedureMaterialItem) {
    const mt = [...(draft.materials ?? [])]; mt[i] = item; setDraftField("materials", mt);
  }
  function removeMaterial(i: number) { setDraftField("materials", (draft.materials ?? []).filter((_, j) => j !== i)); }

  // --- Environment mutations ---
  function addEnvItem() { setDraftField("environment", [...(draft.environment ?? []), { parameter: "", value: "" }]); }
  function updateEnvItem(i: number, item: ProcedureEnvironmentItem) {
    const env = [...(draft.environment ?? [])]; env[i] = item; setDraftField("environment", env);
  }
  function removeEnvItem(i: number) { setDraftField("environment", (draft.environment ?? []).filter((_, j) => j !== i)); }

  // --- Safety mutations ---
  function addSafetyNote() { setDraftField("safety_notes", [...(draft.safety_notes ?? []), ""]); }
  function updateSafetyNote(i: number, note: string) {
    const notes = [...(draft.safety_notes ?? [])]; notes[i] = note; setDraftField("safety_notes", notes);
  }
  function removeSafetyNote(i: number) { setDraftField("safety_notes", (draft.safety_notes ?? []).filter((_, j) => j !== i)); }

  // --- Criteria mutations ---
  function addCriterion() { setDraftField("acceptance_criteria", [...(draft.acceptance_criteria ?? []), { label: "", limit: "" }]); }
  function updateCriterion(i: number, item: ProcedureAcceptanceCriterion) {
    const ac = [...(draft.acceptance_criteria ?? [])]; ac[i] = item; setDraftField("acceptance_criteria", ac);
  }
  function removeCriterion(i: number) { setDraftField("acceptance_criteria", (draft.acceptance_criteria ?? []).filter((_, j) => j !== i)); }

  // --- File actions ---
  function handleAttachClick(stepIndex: number) {
    pendingStepRef.current = stepIndex;
    fileInputRef.current?.click();
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const stepIndex = pendingStepRef.current;
    e.target.value = "";
    if (!file || stepIndex === null) return;
    setUploading(stepIndex);
    try {
      const uploaded = await uploadProcedureStepFile(proc.id, stepIndex, file);
      setStepFiles((prev) => [...prev, uploaded]);
    } catch { /* silent */ } finally { setUploading(null); }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await deleteProcedureFile(proc.id, fileId);
      setStepFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch { /* silent */ }
  }

  // Derived
  const steps = draft.steps ?? [];
  const totalDurationMin = steps.reduce((sum, s) => sum + (s.duration_min ?? 0), 0);
  const formattedDuration = formatDuration(totalDurationMin);

  const hasEquipment = (draft.equipment ?? []).length > 0;
  const hasMaterials = (draft.materials ?? []).length > 0;
  const hasEnvironment = (draft.environment ?? []).length > 0;
  const hasSafety = (draft.safety_notes ?? []).length > 0;
  const hasCriteria = (draft.acceptance_criteria ?? []).length > 0;
  const hasTags = (draft.tags ?? []).length > 0;

  return (
    <div className="space-y-4">
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {deleteModalOpen && (
        <DeleteProcedureModal
          procName={proc.name}
          onConfirm={handleDeleteProcedure}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}

      {/* ── Header card ── */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5">
        {/* Top meta row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {isEditing ? (
              <input type="text" value={draft.proc_id ?? ""} maxLength={20}
                onChange={(e) => setDraftField("proc_id", e.target.value || null)}
                placeholder="PROC-XX-001"
                className="w-28 px-1.5 py-0.5 text-xs font-mono font-semibold rounded-sm border border-mar-border-md bg-mar-surface text-mar-accent focus:outline-hidden focus:ring-1 focus:ring-mar-accent/40" />
            ) : (
              <span className="font-mono font-semibold text-mar-accent">{proc.proc_id ?? "—"}</span>
            )}
            <span>·</span>
            {isEditing ? (
              <input type="text" value={draft.version}
                onChange={(e) => setDraftField("version", e.target.value)}
                placeholder="1.0"
                className="w-16 px-1.5 py-0.5 text-xs rounded-sm border border-mar-border-md bg-mar-surface text-mar-text focus:outline-hidden focus:ring-1 focus:ring-mar-accent/40" />
            ) : (
              <span>v{draft.version}</span>
            )}
            <span>·</span>
            <span>updated {formatDate(proc.updated_at)}</span>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button type="button" onClick={() => setDeleteModalOpen(true)} disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50">
                  <TrashIcon size={12} />Remove
                </button>
                <button type="button" onClick={handleCancel} disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-50">
                  <XIcon size={12} />Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckIcon size={12} />}
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                <button type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
                  <PrinterIcon size={12} />Print
                </button>
                <button type="button" onClick={handleStartEdit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors">
                  <EditIcon size={12} />Edit
                </button>
              </>
            )}
          </div>
        </div>

        {/* Name */}
        {isEditing ? (
          <input type="text" value={draft.name} onChange={(e) => setDraftField("name", e.target.value)}
            placeholder="Procedure name" className={`${INPUT_CLS} text-base font-bold mb-2`} />
        ) : (
          <h2 className="text-lg font-bold text-mar-text mb-1">{draft.name}</h2>
        )}

        {/* Description */}
        {isEditing ? (
          <textarea value={draft.description ?? ""} onChange={(e) => setDraftField("description", e.target.value || null)}
            placeholder="Description (optional)" rows={2} className={`${INPUT_CLS} resize-none mb-4`} />
        ) : (
          draft.description && <p className="text-sm text-gray-400 mb-4">{draft.description}</p>
        )}

        {/* Meta bar */}
        <div className="grid grid-cols-4 gap-4 py-3 border-t border-b border-mar-border mb-4">
          {/* Duration: always computed, never an input */}
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Duration</p>
            <p className="text-xs text-mar-text flex items-center gap-1">
              {formattedDuration ? (
                <><ClockIcon size={11} className="text-gray-400" />{formattedDuration}</>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </p>
          </div>

          {isEditing ? (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Physical quantity</p>
                <select value={draft.physical_quantity} onChange={(e) => setDraftField("physical_quantity", e.target.value)} className={INPUT_CLS}>
                  {PHYSICAL_QUANTITIES.map((q) => <option key={q} value={q}>{capitalize(q)}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Standard</p>
                <input type="text" value={draft.standard_ref ?? ""} onChange={(e) => setDraftField("standard_ref", e.target.value || null)}
                  placeholder="e.g. IEC 60751" className={INPUT_CLS} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Author</p>
                <input type="text" value={draft.author ?? ""} onChange={(e) => setDraftField("author", e.target.value || null)}
                  placeholder="Name" className={INPUT_CLS} />
              </div>
            </>
          ) : (
            <>
              <MetaCell label="Physical quantity" value={capitalize(draft.physical_quantity)} />
              <MetaCell label="Standard" value={draft.standard_ref} />
              <MetaCell label="Author" value={draft.author} />
            </>
          )}
        </div>

        {saveError && (
          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2 mb-3">
            {saveError}
          </p>
        )}

        {isEditing ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Tags</p>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onBlur={(e) => {
                const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                setDraftField("tags", tags.length > 0 ? tags : null);
              }}
              placeholder="tag1, tag2, tag3"
              className={INPUT_CLS}
            />
            <p className="text-[10px] text-gray-400 mt-1">Comma-separated</p>
          </div>
        ) : hasTags ? (
          <div className="flex flex-wrap gap-1.5">
            {(draft.tags ?? []).map((tag) => (
              <span key={tag} className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-mar-accent/10 text-mar-accent border border-mar-accent/20">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Equipment / Materials / Environment ── */}
      {(isEditing || hasEquipment || hasMaterials || hasEnvironment) && (
        <div className="grid grid-cols-3 gap-4">
          {/* Equipment */}
          {(isEditing || hasEquipment) && (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-4">
              <SectionHeader>Equipment</SectionHeader>
              {isEditing ? (
                <TwoColListEditor
                  items={draft.equipment ?? []}
                  col1Label="Name" col2Label="Model" col1Key="name" col2Key="model" col2Optional
                  onAdd={addEquipment}
                  onUpdate={(i, item) => updateEquipment(i, item as ProcedureEquipmentItem)}
                  onRemove={removeEquipment}
                  addLabel="Add equipment"
                />
              ) : (
                <ul className="space-y-3">
                  {(draft.equipment ?? []).map((item, i) => (
                    <li key={i} className="flex flex-col gap-0.5">
                      <p className="text-xs font-medium text-mar-text">{item.name}</p>
                      {item.model && <p className="text-[10px] font-mono text-gray-400">{item.model}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Materials */}
          {(isEditing || hasMaterials) && (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-4">
              <SectionHeader>Materials</SectionHeader>
              {isEditing ? (
                <TwoColListEditor
                  items={draft.materials ?? []}
                  col1Label="Name" col2Label="Quantity" col1Key="name" col2Key="quantity" col2Optional
                  onAdd={addMaterial}
                  onUpdate={(i, item) => updateMaterial(i, item as ProcedureMaterialItem)}
                  onRemove={removeMaterial}
                  addLabel="Add material"
                />
              ) : (
                <ul className="space-y-2">
                  {(draft.materials ?? []).map((item, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <p className="text-xs text-mar-text">{item.name}</p>
                      {item.quantity && <span className="text-[10px] font-mono text-gray-400">{item.quantity}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Environment */}
          {(isEditing || hasEnvironment) && (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-4">
              <SectionHeader>Environment</SectionHeader>
              {isEditing ? (
                <TwoColListEditor
                  items={draft.environment ?? []}
                  col1Label="Parameter" col2Label="Value" col1Key="parameter" col2Key="value"
                  onAdd={addEnvItem}
                  onUpdate={(i, item) => updateEnvItem(i, item as ProcedureEnvironmentItem)}
                  onRemove={removeEnvItem}
                  addLabel="Add condition"
                />
              ) : (
                <ul className="space-y-2">
                  {(draft.environment ?? []).map((item, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <p className="text-xs text-mar-text">{item.parameter}</p>
                      <span className="text-[10px] font-mono text-gray-400">{item.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Safety ── */}
      {(isEditing || hasSafety) && (
        <div className="bg-mar-surface rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-xs p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldIcon size={13} className="text-amber-500" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">Safety</p>
          </div>
          {isEditing ? (
            <SafetyEditor
              notes={draft.safety_notes ?? []}
              onAdd={addSafetyNote}
              onUpdate={updateSafetyNote}
              onRemove={removeSafetyNote}
            />
          ) : (
            <ul className="space-y-1.5">
              {(draft.safety_notes ?? []).map((note, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  <p className="text-xs text-mar-text">{note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Steps ── */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
        <div className="flex items-center justify-between px-5 py-3 border-b border-mar-border">
          <p className="text-xs font-semibold text-mar-text uppercase tracking-wide">Procedure</p>
          <span className="text-xs text-gray-400">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
            {formattedDuration && ` · ${formattedDuration}`}
          </span>
        </div>

        {steps.length === 0 && !isEditing ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">No steps defined</p>
          </div>
        ) : steps.length === 0 && isEditing ? (
          <div className="flex flex-col items-center py-10 text-center">
            <p className="text-sm text-gray-400 mb-3">No steps yet</p>
            <button type="button" onClick={addStep}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-mar-accent border border-mar-accent/30 rounded-lg hover:bg-mar-accent/10 transition-colors">
              <PlusIcon size={12} />Add first step
            </button>
          </div>
        ) : isEditing ? (
          <>
            {steps.map((step, i) => (
              <div key={stepKeys[i]}>
                <StepEditorRow step={step} index={i} total={steps.length}
                  onChange={(s) => updateStep(i, s)} onRemove={() => removeStep(i)}
                  onMoveUp={() => moveStep(i, -1)} onMoveDown={() => moveStep(i, 1)} />
                <div className="px-5 pb-3 pl-18">
                  {(() => {
                    const filesForStep = stepFiles.filter((f) => f.step_index === i);
                    return (
                      <>
                        {filesForStep.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {filesForStep.map((f) => (
                              <StepFileChip key={f.id} file={f} isEditing onDelete={() => handleDeleteFile(f.id)} onImageClick={setLightboxUrl} />
                            ))}
                          </div>
                        )}
                        <button type="button" onClick={() => handleAttachClick(i)} disabled={uploading === i}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-mar-accent disabled:opacity-50 transition-colors">
                          <PaperclipIcon size={11} />
                          {uploading === i ? "Uploading…" : "Attach file"}
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
            <div className="px-5 py-3 border-t border-mar-border">
              <button type="button" onClick={addStep}
                className="flex items-center gap-1.5 text-xs font-medium text-mar-accent hover:text-mar-accent-dark transition-colors">
                <PlusIcon size={12} />Add step
              </button>
            </div>
          </>
        ) : (
          <div className="divide-y divide-mar-border">
            {steps.map((step, i) => {
              const filesForStep = stepFiles.filter((f) => f.step_index === i);
              return (
                <div key={i} className="flex items-start gap-4 px-5 py-4">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-mar-accent/10 text-mar-accent flex items-center justify-center text-xs font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-mar-text mb-0.5">{step.title}</p>
                    {step.description && <p className="text-xs text-gray-400">{step.description}</p>}
                    {filesForStep.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {filesForStep.map((f) => (
                          <StepFileChip key={f.id} file={f} isEditing={false} onDelete={() => handleDeleteFile(f.id)} onImageClick={setLightboxUrl} />
                        ))}
                      </div>
                    )}
                  </div>
                  {step.duration_min != null && (
                    <div className="shrink-0 flex items-center gap-1 text-[11px] text-gray-400">
                      <ClockIcon size={11} />
                      {formatDuration(step.duration_min) ?? `${step.duration_min} min`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileInput} />

      {/* ── Acceptance criteria ── */}
      {(isEditing || hasCriteria) && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Acceptance Criteria</p>
          {isEditing ? (
            <div className="space-y-2">
              {(draft.acceptance_criteria ?? []).length > 0 && (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-1">
                  <span>Criteria</span><span>Acceptance condition</span><span />
                </div>
              )}
              {(draft.acceptance_criteria ?? []).map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input type="text" value={c.label} onChange={(e) => updateCriterion(i, { ...c, label: e.target.value })}
                    placeholder="Criteria" className={INPUT_CLS} />
                  <input type="text" value={c.limit} onChange={(e) => updateCriterion(i, { ...c, limit: e.target.value })}
                    placeholder="Acceptance condition" className={INPUT_CLS} />
                  <button type="button" onClick={() => removeCriterion(i)}
                    className="p-1.5 rounded-sm text-gray-400 hover:text-red-500 hover:bg-mar-surface-alt transition-colors">
                    <TrashIcon size={13} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addCriterion}
                className="flex items-center gap-1.5 text-xs text-mar-accent hover:text-mar-accent-dark transition-colors mt-1">
                <PlusIcon size={11} />Add criterion
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {(draft.acceptance_criteria ?? []).map((c, i) => (
                <div key={i} className="bg-mar-surface-alt border border-mar-border rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">{c.label}</p>
                  <p className="text-sm font-mono font-semibold text-mar-text">{c.limit}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New procedure modal
// ---------------------------------------------------------------------------

type ModalMode = "choose" | "new" | "copy";

interface NewProcedureModalProps {
  procedures: Procedure[];
  onClose: () => void;
  onCreate: (proc: Procedure) => void;
}

function NewProcedureModal({ procedures, onClose, onCreate }: NewProcedureModalProps) {
  const [mode, setMode] = useState<ModalMode>("choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newForm, setNewForm] = useState({ proc_id: "", name: "", physical_quantity: "pressure" });
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});

  const [sourceId, setSourceId] = useState("");
  const [copyProcId, setCopyProcId] = useState("");
  const [copyName, setCopyName] = useState("");
  const [copyErrors, setCopyErrors] = useState<Record<string, string>>({});

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2 text-sm bg-mar-surface border rounded-lg text-mar-text placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-mar-accent/40 focus:border-mar-accent/60 transition-colors ${
      hasError ? "border-red-400 dark:border-red-600" : "border-mar-border-md"
    }`;

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!newForm.proc_id.trim()) errs.proc_id = "Required";
    else if (newForm.proc_id.trim().length > 20) errs.proc_id = "Max 20 characters";
    if (!newForm.name.trim()) errs.name = "Required";
    if (Object.keys(errs).length > 0) { setNewErrors(errs); return; }
    setSaving(true); setError(null);
    try {
      const created = await createProcedure({ proc_id: newForm.proc_id.trim(), name: newForm.name.trim(), physical_quantity: newForm.physical_quantity });
      onCreate(created);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create procedure"); }
    finally { setSaving(false); }
  }

  async function handleCreateCopy(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!sourceId) errs.source = "Select a procedure to copy";
    if (!copyProcId.trim()) errs.proc_id = "Required";
    else if (copyProcId.trim().length > 20) errs.proc_id = "Max 20 characters";
    if (!copyName.trim()) errs.name = "Required";
    if (Object.keys(errs).length > 0) { setCopyErrors(errs); return; }
    const src = procedures.find((p) => p.id === sourceId);
    if (!src) return;
    setSaving(true); setError(null);
    try {
      const created = await createProcedure({
        proc_id: copyProcId.trim(), name: copyName.trim(), physical_quantity: src.physical_quantity,
        description: src.description, version: src.version, difficulty: src.difficulty,
        author: src.author, standard_ref: src.standard_ref, duration_min: src.duration_min,
        tags: src.tags, equipment: src.equipment, materials: src.materials, environment: src.environment,
        safety_notes: src.safety_notes, steps: src.steps, acceptance_criteria: src.acceptance_criteria,
      });
      onCreate(created);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to copy procedure"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-mar-border">
          <h2 className="text-sm font-semibold text-mar-text">New procedure</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-sm hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        {mode === "choose" && (
          <div className="p-6 space-y-3">
            <p className="text-xs text-gray-400 mb-4">How do you want to create the new procedure?</p>
            <button type="button" onClick={() => setMode("new")}
              className="w-full flex items-start gap-4 p-4 border border-mar-border-md rounded-xl hover:bg-mar-surface-alt hover:border-mar-accent/40 transition-colors text-left">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-mar-accent/10 text-mar-accent flex items-center justify-center">
                <PlusIcon size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-mar-text mb-0.5">Create from scratch</p>
                <p className="text-xs text-gray-400">Start with an empty procedure and define steps in the editor</p>
              </div>
            </button>
            <button type="button" onClick={() => setMode("copy")}
              className="w-full flex items-start gap-4 p-4 border border-mar-border-md rounded-xl hover:bg-mar-surface-alt hover:border-mar-accent/40 transition-colors text-left">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-mar-accent/10 text-mar-accent flex items-center justify-center">
                <CopyIcon size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-mar-text mb-0.5">Copy existing procedure</p>
                <p className="text-xs text-gray-400">Duplicate an existing procedure as a starting point</p>
              </div>
            </button>
          </div>
        )}

        {mode === "new" && (
          <form onSubmit={handleCreateNew} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-mar-text mb-1">Procedure ID *</label>
              <input type="text" maxLength={20} placeholder="PROC-XX-001" value={newForm.proc_id}
                onChange={(e) => setNewForm((f) => ({ ...f, proc_id: e.target.value }))} className={inputCls(!!newErrors.proc_id)} />
              {newErrors.proc_id && <p className="mt-1 text-xs text-red-500">{newErrors.proc_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-mar-text mb-1">Name *</label>
              <input type="text" placeholder="Procedure name" value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} className={inputCls(!!newErrors.name)} />
              {newErrors.name && <p className="mt-1 text-xs text-red-500">{newErrors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-mar-text mb-1">Physical quantity *</label>
              <select value={newForm.physical_quantity} onChange={(e) => setNewForm((f) => ({ ...f, physical_quantity: e.target.value }))} className={inputCls(false)}>
                {PHYSICAL_QUANTITIES.map((q) => <option key={q} value={q}>{capitalize(q)}</option>)}
              </select>
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex justify-between items-center pt-1">
              <button type="button" onClick={() => setMode("choose")} className="text-xs text-gray-400 hover:text-mar-text transition-colors">← Back</button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium border border-mar-border-md rounded-lg hover:bg-mar-surface-alt text-mar-text transition-colors disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <CheckIcon size={14} />}
                  {saving ? "Creating…" : "Create & edit"}
                </button>
              </div>
            </div>
          </form>
        )}

        {mode === "copy" && (
          <form onSubmit={handleCreateCopy} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-mar-text mb-1">Copy from *</label>
              <select value={sourceId} onChange={(e) => {
                const id = e.target.value; setSourceId(id);
                const src = procedures.find((p) => p.id === id);
                if (src) { setCopyName(`Copy of ${src.name}`); setCopyProcId(""); }
              }} className={inputCls(!!copyErrors.source)}>
                <option value="">Select a procedure…</option>
                {procedures.map((p) => <option key={p.id} value={p.id}>{p.proc_id ? `[${p.proc_id}] ` : ""}{p.name}</option>)}
              </select>
              {copyErrors.source && <p className="mt-1 text-xs text-red-500">{copyErrors.source}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-mar-text mb-1">New procedure ID *</label>
              <input type="text" maxLength={20} placeholder="PROC-XX-002" value={copyProcId}
                onChange={(e) => setCopyProcId(e.target.value)} className={inputCls(!!copyErrors.proc_id)} />
              {copyErrors.proc_id && <p className="mt-1 text-xs text-red-500">{copyErrors.proc_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-mar-text mb-1">Name *</label>
              <input type="text" placeholder="Name for the new procedure" value={copyName}
                onChange={(e) => setCopyName(e.target.value)} className={inputCls(!!copyErrors.name)} />
              {copyErrors.name && <p className="mt-1 text-xs text-red-500">{copyErrors.name}</p>}
            </div>
            {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex justify-between items-center pt-1">
              <button type="button" onClick={() => setMode("choose")} className="text-xs text-gray-400 hover:text-mar-text transition-colors">← Back</button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium border border-mar-border-md rounded-lg hover:bg-mar-surface-alt text-mar-text transition-colors disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <CopyIcon size={14} />}
                  {saving ? "Copying…" : "Create copy & edit"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs flex flex-col items-center justify-center py-24 text-center">
      <div className="w-10 h-10 rounded-xl bg-mar-border flex items-center justify-center mb-3">
        <ProceduresIcon size={18} className="text-gray-400" />
      </div>
      <p className="text-sm font-medium text-mar-text mb-1">Select a procedure</p>
      <p className="text-xs text-gray-400">Choose a procedure from the list to view its details</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProceduresPage() {
  const router = useRouter();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editNewProcId, setEditNewProcId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    listProcedures()
      .then((data) => { setProcedures(data); if (data.length > 0) setSelected(data[0]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowNewModal(true);
      router.replace("/procedures");
    }
  }, [router]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setLoading(true);
      listProcedures(value || undefined)
        .then((data) => {
          setProcedures(data);
          if (data.length > 0 && (!selected || !data.find((p) => p.id === selected.id))) setSelected(data[0]);
          else if (data.length === 0) setSelected(null);
        })
        .finally(() => setLoading(false));
    }, 300);
  }

  function handleSidebarSelect(proc: Procedure) {
    setSelected(proc);
    setEditNewProcId(null);
  }

  const count = procedures.length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-mar-text">Calibration procedures</h1>
          <p className="text-sm text-gray-400 mt-1">{count} procedure{count !== 1 ? "s" : ""} registered.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors">
            <PlusIcon size={13} />New procedure
          </button>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar */}
        <div className="w-72 shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-xs overflow-hidden sticky top-0 max-h-[calc(100vh-180px)] flex flex-col">
          <div className="px-3 py-2.5 border-b border-mar-border shrink-0">
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search procedures..." value={search} onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-mar-surface-alt border border-mar-border rounded-md text-mar-text placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-mar-accent/40 focus:border-mar-accent/60 transition-colors" />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-mar-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : procedures.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-10">No procedures found</p>
            ) : (
              <ul className="space-y-0.5">
                {procedures.map((proc) => (
                  <li key={proc.id}>
                    <ProcedureListItem proc={proc} active={selected?.id === proc.id} onClick={() => handleSidebarSelect(proc)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <ProcedureDetail
              key={selected.id}
              proc={selected}
              initialEditing={editNewProcId === selected.id}
              onSaved={(updated) => {
                setSelected(updated);
                setProcedures((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              }}
              onDeleted={(id) => {
                setProcedures((prev) => prev.filter((p) => p.id !== id));
                setSelected((prev) => (prev?.id === id ? null : prev));
              }}
            />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>

      {showNewModal && (
        <NewProcedureModal
          procedures={procedures}
          onClose={() => setShowNewModal(false)}
          onCreate={(proc) => {
            setProcedures((prev) => [proc, ...prev]);
            setSelected(proc);
            setEditNewProcId(proc.id);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}
