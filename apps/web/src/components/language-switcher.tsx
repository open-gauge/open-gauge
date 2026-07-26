"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CheckIcon, GlobeIcon } from "@/components/icons";
import { LOCALES } from "@/i18n/locales";
import { updateMe } from "@/services/user.service";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common.language");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleSelect(nextLocale: string) {
    setOpen(false);
    if (nextLocale === locale) return;
    router.replace(pathname, { locale: nextLocale });
    // Best-effort — persists the choice cross-device once signed in. A logged-out
    // visitor (e.g. the login page) simply keeps the NEXT_LOCALE cookie next-intl
    // already sets via router.replace above.
    updateMe({ language: nextLocale }).catch(() => {});
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("label")}
        aria-haspopup="true"
        aria-expanded={open}
        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      >
        <GlobeIcon size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-og-surface border border-og-border rounded-lg shadow-lg z-50 py-1 min-w-[160px]">
          {LOCALES.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => handleSelect(item.code)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-og-text hover:bg-og-surface-alt transition-colors text-left"
            >
              {item.nativeLabel}
              {item.code === locale && <CheckIcon size={12} className="text-og-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
