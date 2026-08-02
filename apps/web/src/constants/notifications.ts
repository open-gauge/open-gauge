// Display labels/descriptions live in translation catalogs (messages/{locale}/tokens.json
// under "notificationCategory") since they're user-facing text — look them up with
// useTranslations("tokens.notificationCategory.label"/"...description") instead of the
// inline strings this constant used to carry.

/** Mirrors app.models.notification_preference.NotificationCategory on the backend. */
export const NOTIFICATION_CATEGORIES = [
  "calibration_due",
  "calibration_created",
  "calibration_checker_assigned",
  "calibration_decided",
  "organization_join_request",
  "organization_join_decision",
] as const;
