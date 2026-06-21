"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ClockIcon,
  DocumentIcon,
  ForkIcon,
  PaperclipIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  ProceduresIcon,
  SearchIcon,
  ShieldIcon,
  XIcon,
} from "@/components/icons";
import { PROCEDURE_DIFFICULTY_STYLE } from "@/lib/tokens";
import {
  createProcedure,
  deleteProcedureFile,
  listProcedureFiles,
  listProcedures,
  uploadProcedureStepFile,
} from "@/services/procedure.service";
import type { Procedure, ProcedureCreateBody } from "@/types/procedure";
import type { StoredFile } from "@/types/stored_file";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function DifficultyBadge({ difficulty }: { difficulty: string | null }) {
  if (!difficulty) return null;
  const cls = PROCEDURE_DIFFICULTY_STYLE[difficulty] ?? "bg-gray-100 text-gray-500 border-gray-200";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {difficulty}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sidebar list item
// ---------------------------------------------------------------------------

function ProcedureListItem({
  proc,
  active,
  onClick,
}: {
  proc: Procedure;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-start gap-3 ${
        active
          ? "bg-mar-accent/10 dark:bg-white/10"
          : "hover:bg-mar-surface-alt"
      }`}
    >
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5 ${
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
          <DifficultyBadge difficulty={proc.difficulty} />
        </div>
        <p className={`text-xs font-medium leading-snug truncate ${active ? "text-mar-text" : "text-mar-text"}`}>
          {proc.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {proc.duration_min != null && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <ClockIcon size={10} />
              {proc.duration_min} min
            </span>
          )}
          <span className="text-[10px] text-gray-400">v{proc.version}</span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

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

function ProcedureDetail({ proc }: { proc: Procedure }) {
  const [stepFiles, setStepFiles] = useState<StoredFile[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingStepRef = useRef<number | null>(null);

  useEffect(() => {
    setStepFiles([]);
    listProcedureFiles(proc.id).then(setStepFiles).catch(() => {});
  }, [proc.id]);

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
    } catch {
      // silent
    } finally {
      setUploading(null);
    }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await deleteProcedureFile(proc.id, fileId);
      setStepFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      // silent
    }
  }

  const hasEquipment = (proc.equipment ?? []).length > 0;
  const hasMaterials = (proc.materials ?? []).length > 0;
  const hasEnvironment = (proc.environment ?? []).length > 0;
  const hasSafety = (proc.safety_notes ?? []).length > 0;
  const hasSteps = (proc.steps ?? []).length > 0;
  const hasCriteria = (proc.acceptance_criteria ?? []).length > 0;
  const hasTags = (proc.tags ?? []).length > 0;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-5">
        {/* Top meta row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-mono font-semibold text-mar-accent">{proc.proc_id ?? "—"}</span>
            <span>·</span>
            <span>v{proc.version}</span>
            <span>·</span>
            <span>updated {formatDate(proc.updated_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
            >
              <ForkIcon size={12} />
              Fork
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
            >
              <PrinterIcon size={12} />
              Print
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
            >
              <PlayIcon size={12} />
              Run on asset
            </button>
          </div>
        </div>

        {/* Title + description */}
        <h2 className="text-lg font-bold text-mar-text mb-1">{proc.name}</h2>
        {proc.description && (
          <p className="text-sm text-gray-400 mb-4">{proc.description}</p>
        )}

        {/* Meta bar */}
        <div className="flex items-center gap-6 py-3 border-t border-b border-mar-border mb-4">
          <MetaCell label="Duration" value={proc.duration_min != null ? `${proc.duration_min} min` : null} />
          <MetaCell label="Difficulty" value={proc.difficulty} />
          <MetaCell label="Standard" value={proc.standard_ref} />
          <MetaCell label="Author" value={proc.author} />
        </div>

        {/* Tags */}
        {hasTags && (
          <div className="flex flex-wrap gap-1.5">
            {(proc.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-mar-accent/10 text-mar-accent border border-mar-accent/20"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Equipment / Materials / Environment */}
      {(hasEquipment || hasMaterials || hasEnvironment) && (
        <div className="grid grid-cols-3 gap-4">
          {hasEquipment && (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-4">
              <SectionHeader>Equipment</SectionHeader>
              <ul className="space-y-3">
                {(proc.equipment ?? []).map((item, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium text-mar-text">{item.name}</p>
                    {item.model && (
                      <p className="text-[10px] font-mono text-gray-400">{item.model}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasMaterials && (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-4">
              <SectionHeader>Materials</SectionHeader>
              <ul className="space-y-2">
                {(proc.materials ?? []).map((item, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <p className="text-xs text-mar-text">{item.name}</p>
                    {item.quantity && (
                      <span className="text-[10px] font-mono text-gray-400">{item.quantity}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasEnvironment && (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-4">
              <SectionHeader>Environment</SectionHeader>
              <ul className="space-y-2">
                {(proc.environment ?? []).map((item, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <p className="text-xs text-mar-text">{item.parameter}</p>
                    <span className="text-[10px] font-mono text-gray-400">{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Safety */}
      {hasSafety && (
        <div className="bg-mar-surface rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldIcon size={13} className="text-amber-500" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Safety
            </p>
          </div>
          <ul className="space-y-1.5">
            {(proc.safety_notes ?? []).map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                <p className="text-xs text-mar-text">{note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Procedure steps */}
      {hasSteps && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-mar-border">
            <p className="text-xs font-semibold text-mar-text uppercase tracking-wide">Procedure</p>
            <span className="text-xs text-gray-400">
              {(proc.steps ?? []).length} steps
              {proc.duration_min != null && ` · ${proc.duration_min} min`}
            </span>
          </div>
          <div className="divide-y divide-mar-border">
            {(proc.steps ?? []).map((step, i) => {
              const filesForStep = stepFiles.filter((f) => f.step_index === i);
              return (
                <div key={i} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-mar-accent/10 text-mar-accent flex items-center justify-center text-xs font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-mar-text mb-0.5">{step.title}</p>
                    {step.description && (
                      <p className="text-xs text-gray-400">{step.description}</p>
                    )}

                    {/* Step attachments */}
                    {filesForStep.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {filesForStep.map((f) => {
                          const isImage = f.content_type.startsWith("image/");
                          return (
                            <div
                              key={f.id}
                              className="group flex items-center gap-1.5 px-2 py-1 bg-mar-surface-alt border border-mar-border rounded-lg text-[11px]"
                            >
                              {isImage && f.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={f.url}
                                  alt={f.original_filename}
                                  className="w-5 h-5 rounded object-cover flex-shrink-0"
                                />
                              ) : (
                                <DocumentIcon size={11} className="text-gray-400 flex-shrink-0" />
                              )}
                              {f.url ? (
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-mar-accent hover:underline truncate max-w-[160px]"
                                >
                                  {f.original_filename}
                                </a>
                              ) : (
                                <span className="text-mar-text truncate max-w-[160px]">{f.original_filename}</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(f.id)}
                                className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                title="Remove attachment"
                              >
                                <XIcon size={10} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Attach button */}
                    <button
                      type="button"
                      onClick={() => handleAttachClick(i)}
                      disabled={uploading === i}
                      className="mt-2 flex items-center gap-1 text-[11px] text-gray-400 hover:text-mar-accent disabled:opacity-50 transition-colors"
                    >
                      <PaperclipIcon size={11} />
                      {uploading === i ? "Uploading…" : "Attach file"}
                    </button>
                  </div>

                  {step.duration_min != null && (
                    <div className="flex-shrink-0 flex items-center gap-1 text-[11px] text-gray-400">
                      <ClockIcon size={11} />
                      {step.duration_min} min
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hidden file input for step attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Acceptance criteria */}
      {hasCriteria && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Acceptance Criteria
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(proc.acceptance_criteria ?? []).map((c, i) => (
              <div key={i} className="bg-mar-surface-alt border border-mar-border rounded-lg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                  {c.label}
                </p>
                <p className="text-sm font-mono font-semibold text-mar-text">{c.limit}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New procedure modal
// ---------------------------------------------------------------------------

const PHYSICAL_QUANTITIES = [
  "pressure", "temperature", "humidity", "flow", "level",
  "electrical", "force", "vibration", "displacement", "torque",
];

const DIFFICULTIES = ["Basic", "Intermediate", "Advanced"];

interface NewProcedureModalProps {
  onClose: () => void;
  onCreate: (proc: Procedure) => void;
}

function NewProcedureModal({ onClose, onCreate }: NewProcedureModalProps) {
  const [form, setForm] = useState<ProcedureCreateBody>({
    proc_id: "",
    physical_quantity: "pressure",
    name: "",
    description: "",
    version: "1.0",
    difficulty: null,
    standard_ref: "",
    author: "",
    duration_min: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.proc_id.trim()) e.proc_id = "Required";
    else if (form.proc_id.trim().length > 20) e.proc_id = "Max 20 characters";
    if (!form.name.trim()) e.name = "Required";
    if (!form.physical_quantity.trim()) e.physical_quantity = "Required";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createProcedure({
        ...form,
        proc_id: form.proc_id.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || null,
        standard_ref: form.standard_ref?.trim() || null,
        author: form.author?.trim() || null,
      });
      onCreate(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create procedure");
    } finally {
      setSaving(false);
    }
  }

  function field(id: keyof ProcedureCreateBody, label: string, node: React.ReactNode) {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-semibold text-mar-text mb-1">{label}</label>
        {node}
        {errors[id] && <p className="mt-1 text-xs text-red-500">{errors[id]}</p>}
      </div>
    );
  }

  const inputCls = (id: keyof ProcedureCreateBody) =>
    `w-full px-3 py-2 text-sm bg-mar-surface border rounded-lg text-mar-text placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-mar-accent/40 focus:border-mar-accent/60 transition-colors ${
      errors[id] ? "border-red-400 dark:border-red-600" : "border-mar-border-md"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-mar-border">
          <h2 className="text-sm font-semibold text-mar-text">New procedure</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field("proc_id", "Procedure ID *",
              <input id="proc_id" type="text" maxLength={20} placeholder="PROC-XX-001"
                value={form.proc_id}
                onChange={(e) => setForm((f) => ({ ...f, proc_id: e.target.value }))}
                className={inputCls("proc_id")} />
            )}
            {field("version", "Version",
              <input id="version" type="text" placeholder="1.0"
                value={form.version ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                className={inputCls("version")} />
            )}
          </div>

          {field("name", "Name *",
            <input id="name" type="text" placeholder="Procedure name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls("name")} />
          )}

          <div className="grid grid-cols-2 gap-4">
            {field("physical_quantity", "Physical quantity *",
              <select id="physical_quantity"
                value={form.physical_quantity}
                onChange={(e) => setForm((f) => ({ ...f, physical_quantity: e.target.value }))}
                className={inputCls("physical_quantity")}>
                {PHYSICAL_QUANTITIES.map((q) => (
                  <option key={q} value={q}>{q.charAt(0).toUpperCase() + q.slice(1)}</option>
                ))}
              </select>
            )}
            {field("difficulty", "Difficulty",
              <select id="difficulty"
                value={form.difficulty ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value || null }))}
                className={inputCls("difficulty")}>
                <option value="">— none —</option>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>

          {field("description", "Description",
            <textarea id="description" rows={3} placeholder="Brief description of this procedure"
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${inputCls("description")} resize-none`} />
          )}

          <div className="grid grid-cols-2 gap-4">
            {field("standard_ref", "Standard / reference",
              <input id="standard_ref" type="text" placeholder="e.g. IEC 60751"
                value={form.standard_ref ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, standard_ref: e.target.value }))}
                className={inputCls("standard_ref")} />
            )}
            {field("author", "Author",
              <input id="author" type="text" placeholder="Name"
                value={form.author ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                className={inputCls("author")} />
            )}
          </div>

          {field("duration_min", "Estimated duration (min)",
            <input id="duration_min" type="number" min={1} placeholder="e.g. 45"
              value={form.duration_min ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value ? Number(e.target.value) : null }))}
              className={inputCls("duration_min")} />
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm font-medium border border-mar-border-md rounded-lg hover:bg-mar-surface-alt text-mar-text transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {saving ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <CheckIcon size={14} />
              )}
              {saving ? "Creating…" : "Create procedure"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm flex flex-col items-center justify-center py-24 text-center">
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
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    listProcedures()
      .then((data) => {
        setProcedures(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setLoading(true);
      listProcedures(value || undefined)
        .then((data) => {
          setProcedures(data);
          if (data.length > 0 && (!selected || !data.find((p) => p.id === selected.id))) {
            setSelected(data[0]);
          } else if (data.length === 0) {
            setSelected(null);
          }
        })
        .finally(() => setLoading(false));
    }, 300);
  }

  const count = procedures.length;

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-mar-text">Calibration procedures</h1>
          <p className="text-sm text-gray-400 mt-1">
            Versioned, recipe-style SOPs. Reproducible across labs and operators.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{count} procedure{count !== 1 ? "s" : ""}</span>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={13} />
            New procedure
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-5 items-start">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-sm overflow-hidden sticky top-0 max-h-[calc(100vh-180px)] flex flex-col">
          {/* Search */}
          <div className="px-3 py-2.5 border-b border-mar-border flex-shrink-0">
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search procedures..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-mar-surface-alt border border-mar-border rounded-md text-mar-text placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-mar-accent/40 focus:border-mar-accent/60 transition-colors"
              />
            </div>
          </div>

          {/* List */}
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
                    <ProcedureListItem
                      proc={proc}
                      active={selected?.id === proc.id}
                      onClick={() => setSelected(proc)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0">
          {selected ? <ProcedureDetail proc={selected} /> : <EmptyDetail />}
        </div>
      </div>

      {showNewModal && (
        <NewProcedureModal
          onClose={() => setShowNewModal(false)}
          onCreate={(proc) => {
            setProcedures((prev) => [proc, ...prev]);
            setSelected(proc);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}
