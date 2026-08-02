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

/**
 * Same idea as `translateDynamic`, for values that could belong to one of
 * several translator namespaces (e.g. a "subtype" filter that mixes DAQ
 * subtypes and sensor physical quantities) — tries each in order and falls
 * back to the raw key if none has it.
 */
export function translateDynamicAny<T extends (key: never) => string>(
  translators: (T & { has: (key: never) => boolean })[],
  key: string,
): string {
  for (const t of translators) {
    const k = key as Parameters<T>[0];
    if (t.has(k)) return t(k);
  }
  return key;
}

/**
 * Maps an audit-log field name (a backend snake_case attribute, e.g.
 * "physical_quantity") to the `tokens.*` sub-namespace that translates *its
 * values* (as opposed to `tokens.auditField`, which translates the field
 * *name* itself). Only fields whose values come from a known enum catalog
 * need an entry — anything else renders as a raw value in ActivityDiff.
 */
const AUDIT_FIELD_VALUE_NAMESPACE: Record<string, string> = {
  physical_quantity: "physicalQuantity",
  technology: "sensorTechnology",
  measurement_type: "measurementType",
  output_type: "outputType",
  mounting_type: "mountingType",
  hazardous_area_rating: "hazardousArea",
  location_type: "locationType",
  org_category: "orgCategory",
  org_type: "orgType",
};

/**
 * Translate a single audit-log field's before/after value, for the shared
 * ActivityDiff component. `role` is entity-dependent (an organization
 * membership role vs. a global user role use different catalogs), so it's
 * resolved separately from the static `AUDIT_FIELD_VALUE_NAMESPACE` map.
 */
export function translateAuditFieldValue<T extends (key: never) => string>(
  t: T & { has: (key: never) => boolean },
  field: string,
  value: string,
  entityType?: string,
): string {
  const ns = field === "role"
    ? (entityType === "organization" ? "orgRole" : "role")
    : AUDIT_FIELD_VALUE_NAMESPACE[field];
  if (!ns) return value;
  const k = `${ns}.${value}` as Parameters<T>[0];
  return t.has(k) ? t(k) : value;
}
