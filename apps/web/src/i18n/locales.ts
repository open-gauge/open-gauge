// Single source of truth for "which languages exist" across the whole app.
// Adding a language is: one entry here + a matching messages/{code}/*.json folder.
// Nothing else in the app should hardcode a locale list.

export interface LocaleMeta {
  code: string;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr" },
  { code: "es", label: "Spanish", nativeLabel: "Español", dir: "ltr" },
  { code: "fr", label: "French", nativeLabel: "Français", dir: "ltr" },
  { code: "de", label: "German", nativeLabel: "Deutsch", dir: "ltr" },
];

export const DEFAULT_LOCALE = "en";

export const LOCALE_CODES = LOCALES.map((locale) => locale.code);

export function getLocaleMeta(code: string): LocaleMeta {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];
}
