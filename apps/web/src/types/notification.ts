export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreference {
  category: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
}
