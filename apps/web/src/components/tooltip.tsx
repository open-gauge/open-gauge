import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { docsUrl } from "@/lib/docs-links";

export function Tooltip({
  content,
  docsHref,
  children,
}: {
  content: string;
  /** Path into the Open Gauge Knowledge Center (e.g. from CHAN_DOCS_LINKS). When set, the trigger becomes a link into the in-app /documentation view with the full explanation. */
  docsHref?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("common.tooltip");
  const trigger = docsHref ? (
    <Link href={docsUrl(docsHref)} aria-label={t("openDocumentation")}>
      {children}
    </Link>
  ) : (
    children
  );

  return (
    <span className="relative group/tip">
      {trigger}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block w-64 bg-gray-900 dark:bg-gray-700 text-white text-[11px] normal-case rounded-lg px-3 py-2 z-50 shadow-lg leading-relaxed whitespace-normal text-left">
        {content}
        {docsHref && <span className="block mt-1.5 text-og-accent font-medium">{t("viewDocumentation")}</span>}
      </span>
    </span>
  );
}
