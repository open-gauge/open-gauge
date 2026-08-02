"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { docsUrl } from "@/lib/docs-links";

export function Tooltip({
  content,
  docsHref,
  children,
}: {
  content: string;
  /** Path into the Open Gauge Knowledge Center (e.g. from CHAN_DOCS_LINKS). When set, the trigger becomes a link into the in-app /documentation view with the full explanation. Opens in a new tab so navigating there never discards in-progress form state (e.g. the calibration wizard). */
  docsHref?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("common.tooltip");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Positioned `fixed` (viewport-relative, computed on hover) rather than
  // `absolute` inside the trigger — an `absolute` popup gets clipped by any
  // ancestor with overflow-hidden (e.g. the calibration wizard's modal card,
  // or the collapsible Environmental Conditions panel), which cut the
  // tooltip off before it could render.
  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, left: rect.left + rect.width / 2 });
  }
  function hide() {
    setPos(null);
  }

  const trigger = docsHref ? (
    <Link href={docsUrl(docsHref)} target="_blank" rel="noopener noreferrer" aria-label={t("openDocumentation")}>
      {children}
    </Link>
  ) : (
    children
  );

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {trigger}
      {pos && (
        <span
          className="fixed pointer-events-none w-64 bg-gray-900 dark:bg-gray-700 text-white text-[11px] normal-case rounded-lg px-3 py-2 z-[100] shadow-lg leading-relaxed whitespace-normal text-left"
          style={{ top: pos.top - 8, left: pos.left, transform: "translate(-50%, -100%)" }}
        >
          {content}
          {docsHref && <span className="block mt-1.5 text-og-accent font-medium">{t("viewDocumentation")}</span>}
        </span>
      )}
    </span>
  );
}
