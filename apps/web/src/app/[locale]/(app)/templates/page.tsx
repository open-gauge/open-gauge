"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { translateDynamic } from "@/lib/translate-dynamic";
import {
  CheckIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  TemplatesIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { Select } from "@/components/select";
import { TEMPLATE_STATUS_STYLE, TEMPLATE_TYPE_STYLE } from "@/lib/tokens";
import {
  archiveTemplate,
  createTemplate,
  duplicateTemplate,
  listTemplates,
  publishTemplate,
} from "@/services/template.service";
import type { TemplateListItem, TemplateType } from "@/types/template";

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("tokens.templateStatus");
  const cls = TEMPLATE_STATUS_STYLE[status] ?? TEMPLATE_STATUS_STYLE.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${cls}`}>
      {translateDynamic(t, status)}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const t = useTranslations("tokens.templateType");
  const cls = TEMPLATE_TYPE_STYLE[type] ?? TEMPLATE_TYPE_STYLE.certificate;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${cls}`}>
      {translateDynamic(t, type)}
    </span>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("templates.page");
  const tType = useTranslations("tokens.templateType");
  const tStatus = useTranslations("tokens.templateStatus");
  const { user } = useAuth();
  const canEdit = user.role !== "viewer";

  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    return listTemplates({
      type: (typeFilter as TemplateType) || undefined,
      status: (statusFilter as TemplateListItem["status"]) || undefined,
      q: search || undefined,
    })
      .then(setTemplates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter, search]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewOpen(true);
      router.replace("/templates");
    }
  }, [searchParams, router]);

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      await duplicateTemplate(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(id: string) {
    setBusyId(id);
    try {
      await publishTemplate(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(id: string) {
    setBusyId(id);
    setConfirmArchiveId(null);
    try {
      await archiveTemplate(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-5">
      {newOpen && (
        <NewTemplateModal
          onClose={() => setNewOpen(false)}
          onCreated={(id) => router.push(`/templates/${id}`)}
        />
      )}

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-og-text">{t("title")}</h1>
          <p className="text-sm text-gray-400 mt-1">{t("count", { count: templates.length })}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={13} />
            {t("newTemplate")}
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-og-surface-alt border border-og-border-md rounded-lg">
            <SearchIcon size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="flex-1 bg-transparent text-xs text-og-text placeholder:text-gray-400 outline-hidden"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            className="w-44"
            placeholder={t("filterAll")}
            options={[
              { value: "certificate", label: tType("certificate") },
              { value: "procedure", label: tType("procedure") },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-32"
            placeholder={t("filterAllStatus")}
            options={[
              { value: "draft", label: tStatus("draft") },
              { value: "published", label: tStatus("published") },
              { value: "archived", label: tStatus("archived") },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
        </div>
      )}

      {!loading && !error && templates.length === 0 && (
        <div className="bg-og-surface rounded-xl border border-og-border shadow-xs flex flex-col items-center justify-center py-16 text-center gap-2">
          <TemplatesIcon size={28} className="text-gray-300" />
          <p className="text-sm font-semibold text-og-text">{t("emptyTitle")}</p>
          <p className="text-sm text-gray-400 max-w-sm">{t("emptyDescription")}</p>
        </div>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="bg-og-surface rounded-xl border border-og-border shadow-xs overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-og-border">
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("columns.name")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("columns.type")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("columns.status")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("columns.version")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("columns.updated")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id} className="border-b border-og-border last:border-0 hover:bg-og-surface-alt/60 transition-colors">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/templates/${tpl.id}`)}
                      className="text-sm font-medium text-og-text hover:text-og-accent transition-colors text-left"
                    >
                      {tpl.name}
                    </button>
                    {tpl.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{tpl.description}</p>}
                  </td>
                  <td className="px-4 py-2.5"><TypeBadge type={tpl.type} /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={tpl.status} /></td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">v{tpl.version}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">{formatDate(tpl.updated_at)}</td>
                  <td className="px-4 py-2.5">
                    {confirmArchiveId === tpl.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-400">{t("actions.confirmArchive")}</span>
                        <button
                          type="button"
                          onClick={() => handleArchive(tpl.id)}
                          className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        >
                          {t("actions.archive")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmArchiveId(null)}
                          className="p-1 text-gray-400 hover:text-og-text transition-colors"
                        >
                          <XIcon size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title={t("actions.edit")}
                          onClick={() => router.push(`/templates/${tpl.id}`)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-og-accent hover:bg-og-accent/10 transition-colors"
                        >
                          <EditIcon size={13} />
                        </button>
                        {canEdit && tpl.status === "draft" && (
                          <button
                            type="button"
                            title={t("actions.publish")}
                            disabled={busyId === tpl.id}
                            onClick={() => handlePublish(tpl.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
                          >
                            <CheckIcon size={13} />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            title={t("actions.duplicate")}
                            disabled={busyId === tpl.id}
                            onClick={() => handleDuplicate(tpl.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-50"
                          >
                            <CopyIcon size={13} />
                          </button>
                        )}
                        {canEdit && tpl.status !== "archived" && (
                          <button
                            type="button"
                            title={t("actions.archive")}
                            onClick={() => setConfirmArchiveId(tpl.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          >
                            <TrashIcon size={13} />
                          </button>
                        )}
                        {canEdit && tpl.status === "archived" && (
                          <button
                            type="button"
                            title={t("actions.duplicate")}
                            disabled={busyId === tpl.id}
                            onClick={() => handleDuplicate(tpl.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-50"
                          >
                            <RestoreIcon size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("templates.newForm");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TemplateType>("certificate");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createTemplate({ name: name.trim(), description: description.trim() || null, type });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-og-surface border border-og-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text">{t("title")}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
            <XIcon size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="w-full px-3 py-2 rounded-lg border border-og-border-md text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:ring-og-accent/40 focus:border-og-accent/60 transition-colors placeholder-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-og-border-md text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:ring-og-accent/40 focus:border-og-accent/60 transition-colors placeholder-gray-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("type")}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("certificate")}
                className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  type === "certificate"
                    ? "border-og-accent bg-og-accent/5 text-og-accent"
                    : "border-og-border-md text-gray-500 hover:bg-og-surface-alt"
                }`}
              >
                {t("typeCertificate")}
              </button>
              <button
                type="button"
                onClick={() => setType("procedure")}
                className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  type === "procedure"
                    ? "border-og-accent bg-og-accent/5 text-og-accent"
                    : "border-og-border-md text-gray-500 hover:bg-og-surface-alt"
                }`}
              >
                {t("typeProcedure")}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-og-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {t("create")}
          </button>
        </div>
      </div>
    </div>
  );
}
