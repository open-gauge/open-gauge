// Display labels live in translation catalogs (messages/{locale}/tokens.json under
// "role") since they're user-facing text — look them up with
// useTranslations("tokens.role") instead of a ROLE_LABELS constant here.

export const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  technician: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  viewer: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
