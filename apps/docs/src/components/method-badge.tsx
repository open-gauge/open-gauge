const METHOD_STYLES: Record<string, string> = {
  get: "text-emerald-600 dark:text-emerald-400",
  post: "text-blue-600 dark:text-blue-400",
  put: "text-amber-600 dark:text-amber-400",
  patch: "text-purple-600 dark:text-purple-400",
  delete: "text-red-600 dark:text-red-400",
};

/** Small fixed-width HTTP method label shown next to an API endpoint's name
 * in the sidebar, so its verb is visible without opening the page. */
export function MethodBadge({ method }: { method: string }) {
  const key = method.toLowerCase();
  return (
    <span
      className={`shrink-0 w-11 text-center font-mono text-[10px] font-semibold uppercase tracking-wide ${METHOD_STYLES[key] ?? "text-fd-muted-foreground"}`}
    >
      {key}
    </span>
  );
}
