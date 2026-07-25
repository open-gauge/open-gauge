export interface NotificationCategoryInfo {
  category: string;
  label: string;
  description: string;
}

/** Mirrors app.models.notification_preference.NotificationCategory on the backend. */
export const NOTIFICATION_CATEGORIES: NotificationCategoryInfo[] = [
  {
    category: "calibration_due",
    label: "Calibration due",
    description: "An asset's calibration is due soon or overdue.",
  },
  {
    category: "calibration_created",
    label: "New calibration recorded",
    description: "A new calibration was logged for an asset in one of your organizations.",
  },
  {
    category: "organization_join_request",
    label: "Organization join requests",
    description: "Someone asks to join an organization you administer.",
  },
  {
    category: "organization_join_decision",
    label: "Organization join decisions",
    description: "An admin approves or declines your request to join an organization.",
  },
];
