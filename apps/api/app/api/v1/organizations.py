import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.organization import Organization
from ...models.organization_join_request import JoinRequestStatus
from ...models.organization_member import OrganizationMember, OrgRole
from ...models.user import User, UserRole
from ...repositories import audit_log as audit_log_repo
from ...repositories import location as location_repo
from ...repositories import organization as org_repo
from ...repositories import organization_join_request as join_repo
from ...repositories import stored_file as file_repo
from ...schemas.organization import (
    AddMembersRequest,
    EligibleUserResponse,
    OrganizationCreate,
    OrganizationJoinRequestResponse,
    OrganizationListItem,
    OrganizationMemberResponse,
    OrganizationMemberRoleUpdate,
    OrganizationResponse,
    OrganizationUpdate,
)
from ...services import organization_notify as org_notify
from ...services import organization_permissions as org_perm
from ...services import storage as storage_svc

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def _get_org_or_404(db: Session, org_id: uuid.UUID, current_user: User) -> Organization:
    """A deactivated (deleted) organization is invisible to everyone except
    Super Admin, who can still reach it directly (e.g. from an old link)."""
    org = org_repo.get_by_id(db, org_id)
    if not org or (not org.is_active and current_user.role != UserRole.superadmin):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


def _require_org_admin(db: Session, current_user: User, org: Organization) -> None:
    if not org_perm.is_org_admin(db, current_user, org):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization admin only")


def _member_response(db: Session, membership) -> OrganizationMemberResponse | None:
    user = db.query(User).filter(User.id == membership.user_id).first()
    if not user:
        return None
    return OrganizationMemberResponse(
        user_id=user.id, name=user.name, email=user.email,
        role=membership.role, active=membership.active, created_at=membership.created_at,
    )


def _viewer_fields(db: Session, org: Organization, current_user: User) -> dict:
    """Fields describing the *caller's own* relationship to `org` — never the
    roster or other org secrets, so safe to compute even for a private org
    the caller isn't a member of. Shared by the detail endpoint and the list
    endpoint so both surfaces (and their Join/Leave buttons) agree."""
    membership = org_perm.get_membership(db, org.id, current_user.id)
    is_member = org_perm.is_org_member(db, current_user, org)
    can_manage = org_perm.is_org_admin(db, current_user, org)
    my_role = membership.role if (membership and membership.active) else None
    fields = {
        "is_member": is_member,
        "my_role": my_role,
        "can_manage": can_manage,
        "is_last_admin": org_perm.is_last_admin(db, current_user, org),
        "has_pending_join_request": (
            not is_member and join_repo.has_pending(db, org.id, current_user.id)
        ),
    }
    return fields


def _build_org_response(db: Session, org: Organization, current_user: User) -> OrganizationResponse:
    """Full profile for members (and Super Admin, who overrides every org);
    only the base id/name/private fields for a non-member viewing a private
    org — everything else, including whether the org even has members or
    assets, is hidden per the "private orgs are members-only" rule."""
    viewer = _viewer_fields(db, org, current_user)

    data = OrganizationResponse(
        id=org.id, name=org.name, private=org.private, is_active=org.is_active,
        created_at=org.created_at, updated_at=org.updated_at,
        **viewer,
    )

    if org.private and not viewer["is_member"]:
        return data

    data.full_name = org.full_name
    data.description = org.description
    data.website = org.website
    data.location_id = org.location_id
    data.email = org.email
    data.phone = org.phone
    data.logo_file_id = org.logo_file_id
    data.asset_count = org_repo.count_assets(db, org.id)
    data.member_count = org_repo.count_members(db, org.id)
    if org.logo_file_id:
        f = file_repo.get_by_id(db, org.logo_file_id)
        if f:
            data.logo_url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
    if org.location_id:
        loc = location_repo.get_by_id(db, org.location_id)
        if loc:
            data.location_name = loc.name
    return data


@router.get("", response_model=list[OrganizationListItem])
def list_organizations(
    skip: int = 0,
    limit: int = 50,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrganizationListItem]:
    """Every active organization, name-only for private ones — enough for a
    non-member to discover a private org exists and request to join it.
    `mine=true` scopes the list to the caller's own active memberships (e.g.
    the organization picker on asset creation). Super Admin additionally sees
    deactivated organizations — the only way to reach one, since it's
    invisible to everyone else."""
    if mine:
        orgs = org_repo.list_user_organizations(db, current_user.id)
    else:
        is_active_filter = None if current_user.role == UserRole.superadmin else True
        orgs = org_repo.list_organizations(db, skip=skip, limit=limit, is_active=is_active_filter)
    result = []
    for o in orgs:
        item = OrganizationListItem.model_validate(o)
        viewer = _viewer_fields(db, o, current_user)
        item.is_member = viewer["is_member"]
        item.my_role = viewer["my_role"]
        item.is_last_admin = viewer["is_last_admin"]
        item.has_pending_join_request = viewer["has_pending_join_request"]
        item.member_count = org_repo.count_members(db, o.id) if viewer["is_member"] else None
        if o.logo_file_id and not o.private:
            f = file_repo.get_by_id(db, o.logo_file_id)
            if f:
                item.logo_url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
        result.append(item)
    return result


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    """Any authenticated user may create an organization — org creation is a
    self-service action independent of the global RBAC role, mirroring Gogs/
    GitHub. The creator automatically becomes that org's first admin member."""
    org = org_repo.create(
        db,
        name=body.name,
        full_name=body.full_name,
        description=body.description,
        website=body.website,
        location_id=body.location_id,
        email=body.email,
        phone=body.phone,
        private=body.private,
    )
    org_repo.upsert_membership(db, org.id, current_user.id, role=OrgRole.admin)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.created", entity_type="organization", entity_id=org.id,
    )
    return _build_org_response(db, org, current_user)


@router.get("/{org_id}", response_model=OrganizationResponse)
def get_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    org = _get_org_or_404(db, org_id, current_user)
    return _build_org_response(db, org, current_user)


@router.put("/{org_id}", response_model=OrganizationResponse)
def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    org = org_repo.update(db, org, **body.model_dump(exclude_none=True))
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.updated", entity_type="organization", entity_id=org.id,
    )
    return _build_org_response(db, org, current_user)


@router.post("/{org_id}/logo", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def upload_org_logo(
    org_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    """Upload or replace an organization's logo. Organization admin only."""
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)

    data = await file.read()
    try:
        content_type = storage_svc.validate_image_upload(file.content_type, len(data))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    old_file_id = org.logo_file_id

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"organizations/{org.id}", file.filename or "logo")
    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "logo",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="organization_logo",
        entity_id=org.id,
        uploaded_by=current_user.id,
    )
    org_repo.set_logo(db, org, record.id)

    if old_file_id:
        old_file = file_repo.get_by_id(db, old_file_id)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file_id)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="organization.logo_updated",
        entity_type="organization",
        entity_id=org.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _build_org_response(db, org, current_user)


@router.delete("/{org_id}/logo", response_model=OrganizationResponse)
def delete_org_logo(
    org_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    """Remove an organization's logo, if one is set. Organization admin only."""
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)

    if org.logo_file_id:
        old_file = file_repo.get_by_id(db, org.logo_file_id)
        org_repo.set_logo(db, org, None)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file.id)
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="organization.logo_removed",
            entity_type="organization",
            entity_id=org.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return _build_org_response(db, org, current_user)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org.id, OrganizationMember.active.is_(True)
    ).update({"active": False})
    org_repo.deactivate(db, org)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.deactivated", entity_type="organization", entity_id=org.id,
    )


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/{org_id}/members", response_model=list[OrganizationMemberResponse])
def list_org_members(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrganizationMemberResponse]:
    """The member roster is not public information — even for a non-private
    organization, only members (or Super Admin) can see who else is in it."""
    org = _get_org_or_404(db, org_id, current_user)
    if not org_perm.is_org_member(db, current_user, org):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Members only")
    memberships = org_repo.list_members(db, org.id)
    return [r for m in memberships if (r := _member_response(db, m))]


@router.get("/{org_id}/eligible-members", response_model=list[EligibleUserResponse])
def list_eligible_members(
    org_id: uuid.UUID,
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EligibleUserResponse]:
    """Users who could be added as a member — org admin only, same gate as
    every other member-management endpoint (not global-admin gated)."""
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    return org_repo.list_non_members(db, org.id, q=q)


@router.post("/{org_id}/members", response_model=list[OrganizationMemberResponse], status_code=status.HTTP_201_CREATED)
def add_members(
    org_id: uuid.UUID,
    body: AddMembersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrganizationMemberResponse]:
    """Directly add one or more users as `member`-role members — org admin
    only. Unknown user ids are silently skipped."""
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    added_ids: list[str] = []
    for user_id in body.user_ids:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            continue
        org_repo.upsert_membership(db, org.id, user.id, role=OrgRole.member)
        added_ids.append(str(user.id))
    if added_ids:
        audit_log_repo.create(
            db, actor_id=current_user.id, actor_email=current_user.email,
            action="organization.members_added", entity_type="organization", entity_id=org.id,
            after_state={"user_ids": added_ids},
        )
    memberships = org_repo.list_members(db, org.id)
    return [r for m in memberships if (r := _member_response(db, m))]


@router.put("/{org_id}/members/{user_id}", response_model=OrganizationMemberResponse)
def update_member_role(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    body: OrganizationMemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationMemberResponse:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    membership = org_perm.get_membership(db, org.id, user_id)
    if not membership or not membership.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if (
        user_id == current_user.id
        and body.role != OrgRole.admin
        and org_perm.count_active_admins(db, org.id) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assign another admin before stepping down — an organization must always have at least one admin.",
        )
    before_role = membership.role
    membership = org_repo.set_member_role(db, membership, body.role)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.member_role_changed", entity_type="organization", entity_id=org.id,
        before_state={"user_id": str(user_id), "role": before_role.value},
        after_state={"user_id": str(user_id), "role": body.role.value},
    )
    response = _member_response(db, membership)
    if not response:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return response


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    membership = org_perm.get_membership(db, org.id, user_id)
    if not membership or not membership.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if (
        user_id == current_user.id
        and membership.role == OrgRole.admin
        and org_perm.count_active_admins(db, org.id) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You're the last admin — promote someone else first, or delete the organization.",
        )
    org_repo.deactivate_membership(db, membership)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.member_removed", entity_type="organization", entity_id=org.id,
        after_state={"user_id": str(user_id)},
    )


@router.post("/{org_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    org = _get_org_or_404(db, org_id, current_user)
    membership = org_perm.get_membership(db, org.id, current_user.id)
    if not membership or not membership.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You're not a member of this organization")
    if membership.role == OrgRole.admin and org_perm.count_active_admins(db, org.id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You're the last admin — promote someone else first, or delete the organization.",
        )
    org_repo.deactivate_membership(db, membership)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.left", entity_type="organization", entity_id=org.id,
    )


# ---------------------------------------------------------------------------
# Join requests
# ---------------------------------------------------------------------------

@router.post("/{org_id}/join-requests", response_model=OrganizationJoinRequestResponse, status_code=status.HTTP_201_CREATED)
def create_join_request(
    org_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationJoinRequestResponse:
    org = _get_org_or_404(db, org_id, current_user)
    if org_perm.is_org_member(db, current_user, org):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You're already a member of this organization")
    if join_repo.has_pending(db, org.id, current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a pending request to join this organization")
    request = join_repo.create(db, org.id, current_user.id)
    org_notify.create_join_request_notifications(db, org, current_user)
    background_tasks.add_task(org_notify.send_join_request_emails, org.id, current_user.id)
    return OrganizationJoinRequestResponse(
        id=request.id, organization_id=org.id, user_id=current_user.id,
        user_name=current_user.name, user_email=current_user.email,
        status=request.status.value, created_at=request.created_at,
    )


@router.get("/{org_id}/join-requests", response_model=list[OrganizationJoinRequestResponse])
def list_join_requests(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrganizationJoinRequestResponse]:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    requests = join_repo.list_pending_for_org(db, org.id)
    result = []
    for r in requests:
        user = db.query(User).filter(User.id == r.user_id).first()
        if not user:
            continue
        result.append(OrganizationJoinRequestResponse(
            id=r.id, organization_id=org.id, user_id=user.id,
            user_name=user.name, user_email=user.email,
            status=r.status.value, created_at=r.created_at,
        ))
    return result


@router.post("/{org_id}/join-requests/{request_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve_join_request(
    org_id: uuid.UUID,
    request_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    request = join_repo.get_by_id(db, request_id)
    if not request or request.organization_id != org.id or request.status != JoinRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join request not found")
    join_repo.decide(db, request, JoinRequestStatus.approved, current_user.id)
    org_repo.upsert_membership(db, org.id, request.user_id, role=OrgRole.member)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.join_approved", entity_type="organization", entity_id=org.id,
        after_state={"user_id": str(request.user_id)},
    )
    org_notify.create_join_decision_notification(db, request, org, True)
    background_tasks.add_task(org_notify.send_join_decision_email, request.id, True)


@router.post("/{org_id}/join-requests/{request_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_join_request(
    org_id: uuid.UUID,
    request_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    org = _get_org_or_404(db, org_id, current_user)
    _require_org_admin(db, current_user, org)
    request = join_repo.get_by_id(db, request_id)
    if not request or request.organization_id != org.id or request.status != JoinRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join request not found")
    join_repo.decide(db, request, JoinRequestStatus.rejected, current_user.id)
    audit_log_repo.create(
        db, actor_id=current_user.id, actor_email=current_user.email,
        action="organization.join_rejected", entity_type="organization", entity_id=org.id,
        after_state={"user_id": str(request.user_id)},
    )
    org_notify.create_join_decision_notification(db, request, org, False)
    background_tasks.add_task(org_notify.send_join_decision_email, request.id, False)
