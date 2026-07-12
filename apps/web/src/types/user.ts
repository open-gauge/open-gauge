export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "technician" | "viewer";
  team: string | null;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  profile_picture_id: string | null;
  profile_picture_url: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}
