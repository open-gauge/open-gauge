"use client";

import { useTranslations } from "next-intl";
import { MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/store/theme";

export default function ThemeToggle() {
  const t = useTranslations("common.theme");
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? t("switchToLight") : t("switchToDark")}
      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
