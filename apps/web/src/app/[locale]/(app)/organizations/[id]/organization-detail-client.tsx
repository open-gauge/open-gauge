"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

// Organizations now live on a single master-detail page (/organizations) —
// the sidebar list and detail panel share one URL, selected via ?id=. This
// route only exists so old bookmarks and notification links of the form
// /organizations/{id}[?edit=1] (see apps/api/app/services/organization_notify.py)
// keep working; it immediately forwards to the merged page.
export default function OrganizationDetailClient() {
  const t = useTranslations("organizations.detail");
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const qs = new URLSearchParams({ id });
    if (searchParams.get("edit") === "1") qs.set("edit", "1");
    router.replace(`/organizations?${qs.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="p-6 flex items-center justify-center py-20 text-gray-400">
      <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
      {t("loading")}
    </div>
  );
}
