/**
 * Look up a translation whose exact key is only known at runtime (a status,
 * category, or subtype value coming from the API) rather than a literal
 * string next-intl's typed `t()` can check at compile time. Falls back to
 * the raw key for values with no catalog entry (legacy/unseen data), same
 * as the `LABEL[key] ?? key` pattern this replaces.
 */
export function translateDynamic<T extends (key: never) => string>(
  t: T & { has: (key: never) => boolean },
  key: string,
): string {
  const k = key as Parameters<T>[0];
  return t.has(k) ? t(k) : key;
}
