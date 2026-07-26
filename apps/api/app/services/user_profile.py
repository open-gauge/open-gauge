import uuid

from sqlalchemy.orm import Session

from ..repositories import stored_file as file_repo
from . import storage as storage_svc


def resolve_picture_url(db: Session, picture_id: uuid.UUID | None) -> str | None:
    """Resolve a stored_file id into a presigned download URL, or None if
    absent/missing. Shared by every place that surfaces a user's profile
    picture inline in another response (org membership, join requests,
    audit logs, ...) so each one doesn't reimplement the same two-step
    file_repo + storage_svc lookup."""
    if not picture_id:
        return None
    f = file_repo.get_by_id(db, picture_id)
    if not f:
        return None
    return storage_svc.get_presigned_url(f.storage_path, f.bucket)
