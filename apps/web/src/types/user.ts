export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "technician" | "viewer";
  team: string | null;
  is_active: boolean;
  is_superuser: boolean;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}
