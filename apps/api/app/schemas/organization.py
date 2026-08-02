import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models.organization_member import OrgRole

# "internal" is the existing self-service, joinable workspace. "external" is an
# admin-managed directory entry for an organization outside the system, further
# typed as one of ORG_TYPES. Plain VARCHAR + Pydantic validation (not a Postgres
# ENUM), mirroring the `language` field precedent in schemas/user.py.
ORG_CATEGORIES = ("internal", "external")
ORG_TYPES = ("provider", "customer")


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    full_name: str | None = None
    description: str | None = None
    website: str | None = None
    location_id: uuid.UUID | None = None
    email: str | None = None
    phone: str | None = None
    private: bool = False

    org_category: str = "internal"
    org_type: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    vat_number: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    address_postal_code: str | None = None
    address_country: str | None = None

    @field_validator("org_category")
    @classmethod
    def validate_org_category(cls, value: str) -> str:
        if value not in ORG_CATEGORIES:
            raise ValueError(f"Unsupported org_category: {value}")
        return value

    @field_validator("org_type")
    @classmethod
    def validate_org_type(cls, value: str | None) -> str | None:
        if value is not None and value not in ORG_TYPES:
            raise ValueError(f"Unsupported org_type: {value}")
        return value

    @model_validator(mode="after")
    def require_org_type_when_external(self) -> "OrganizationCreate":
        if self.org_category == "external" and self.org_type is None:
            raise ValueError("org_type is required when org_category is 'external'")
        return self


class OrganizationUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    full_name: str | None = None
    description: str | None = None
    website: str | None = None
    location_id: uuid.UUID | None = None
    email: str | None = None
    phone: str | None = None
    private: bool | None = None
    is_active: bool | None = None

    org_category: str | None = None
    org_type: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    vat_number: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    address_postal_code: str | None = None
    address_country: str | None = None

    @field_validator("org_category")
    @classmethod
    def validate_org_category(cls, value: str | None) -> str | None:
        if value is not None and value not in ORG_CATEGORIES:
            raise ValueError(f"Unsupported org_category: {value}")
        return value

    @field_validator("org_type")
    @classmethod
    def validate_org_type(cls, value: str | None) -> str | None:
        if value is not None and value not in ORG_TYPES:
            raise ValueError(f"Unsupported org_type: {value}")
        return value


class OrganizationListItem(BaseModel):
    """Safe to return regardless of the viewer's membership — used for the
    /organizations list, including private orgs (name-only, so a non-member
    can still find and request to join one). The viewer-relative fields below
    describe only the caller's own relationship to the org (never the roster
    or other secrets) so they're safe to populate even for a private org the
    caller isn't in — they drive the Join/Leave button on the list row."""

    id: uuid.UUID
    name: str
    private: bool
    logo_url: str | None = None
    is_active: bool = True

    org_category: str = "internal"
    org_type: str | None = None

    is_member: bool = False
    my_role: OrgRole | None = None
    is_last_admin: bool = False
    has_pending_join_request: bool = False
    member_count: int | None = None

    model_config = {"from_attributes": True}


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    private: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    org_category: str = "internal"

    # Public fields — populated for any org the viewer can see the page for
    # (non-private, or private-and-a-member/superadmin). None otherwise.
    full_name: str | None = None
    description: str | None = None
    website: str | None = None
    location_id: uuid.UUID | None = None
    location_name: str | None = None
    email: str | None = None
    phone: str | None = None
    logo_file_id: uuid.UUID | None = None
    logo_url: str | None = None
    asset_count: int | None = None
    member_count: int | None = None
    org_type: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    vat_number: str | None = None
    address_street: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    address_postal_code: str | None = None
    address_country: str | None = None

    # Viewer-relative fields — always populated
    is_member: bool = False
    my_role: OrgRole | None = None
    can_manage: bool = False
    is_last_admin: bool = False
    has_pending_join_request: bool = False

    model_config = {"from_attributes": True}


class OrganizationMemberResponse(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    profile_picture_url: str | None = None
    role: OrgRole
    active: bool
    created_at: datetime


class OrganizationMemberRoleUpdate(BaseModel):
    role: OrgRole


class OrganizationJoinRequestResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    user_profile_picture_url: str | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EligibleUserResponse(BaseModel):
    """A user not currently an active member of the org — candidate for the
    Add Member dropdown."""

    id: uuid.UUID
    name: str
    email: str
    profile_picture_url: str | None = None

    model_config = {"from_attributes": True}


class AddMembersRequest(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1)
