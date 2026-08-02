export type OrgRole = "member" | "admin";
export type OrgCategory = "internal" | "external";
export type OrgType = "provider" | "customer";

export interface OrganizationListItem {
  id: string;
  name: string;
  private: boolean;
  logo_url: string | null;
  is_active: boolean;
  org_category: OrgCategory;
  org_type: OrgType | null;
  is_member: boolean;
  my_role: OrgRole | null;
  is_last_admin: boolean;
  has_pending_join_request: boolean;
  member_count: number | null;
}

export interface Organization {
  id: string;
  name: string;
  private: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  org_category: OrgCategory;
  full_name: string | null;
  description: string | null;
  website: string | null;
  location_id: string | null;
  location_name: string | null;
  email: string | null;
  phone: string | null;
  logo_file_id: string | null;
  logo_url: string | null;
  asset_count: number | null;
  member_count: number | null;
  org_type: OrgType | null;
  contact_email: string | null;
  contact_phone: string | null;
  vat_number: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  is_member: boolean;
  my_role: OrgRole | null;
  can_manage: boolean;
  is_last_admin: boolean;
  has_pending_join_request: boolean;
}

export interface OrganizationMember {
  user_id: string;
  name: string;
  email: string;
  profile_picture_url: string | null;
  role: OrgRole;
  active: boolean;
  created_at: string;
}

export interface EligibleUser {
  id: string;
  name: string;
  email: string;
  profile_picture_url: string | null;
}

export interface OrganizationJoinRequest {
  id: string;
  organization_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_profile_picture_url: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface OrganizationCreateBody {
  name: string;
  full_name?: string | null;
  description?: string | null;
  website?: string | null;
  location_id?: string | null;
  email?: string | null;
  phone?: string | null;
  private?: boolean;
  org_category?: OrgCategory;
  org_type?: OrgType | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  vat_number?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
}

export type OrganizationUpdateBody = Partial<OrganizationCreateBody> & { is_active?: boolean };

export interface SigningCertificate {
  algorithm: string;
  subject_common_name: string;
  certificate_pem: string;
  fingerprint_sha256: string;
  not_valid_before: string;
  not_valid_after: string;
}
