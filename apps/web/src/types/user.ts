export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "technician" | "viewer";
  is_active: boolean;
  is_verified: boolean;
  profile_picture_id: string | null;
  profile_picture_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSignature {
  id: string;
  version: number;
  source: "upload" | "drawn";
  is_active: boolean;
  image_url: string | null;
  fingerprint_sha256: string;
  created_at: string;
}
