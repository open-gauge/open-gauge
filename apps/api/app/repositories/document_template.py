import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..models.document_template import DocumentTemplate


def _default_document() -> dict[str, Any]:
    return {
        "settings": {
            "page_size": "a4",
            "orientation": "portrait",
            "margins": {"top": 20, "right": 18, "bottom": 20, "left": 18},
            "default_font": "Inter",
            "default_font_size": 10,
            "header_enabled": True,
            "footer_enabled": True,
        },
        # Header/footer are each a single "zone" — a block list, same shape as the document's
        # own top-level `blocks` — not a fixed left/center/right split. Any block type (image,
        # signature, table, a Columns block for a multi-column layout, ...) can be placed in it;
        # see apps/web/src/lib/template-zones.ts for the addressing scheme this mirrors.
        "header": {"enabled": True, "blocks": [], "height": 14},
        "footer": {"enabled": True, "blocks": [], "height": 14},
        "blocks": [],
    }


def get_by_id(db: Session, template_id: uuid.UUID) -> DocumentTemplate | None:
    return db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()


def list_latest(
    db: Session,
    *,
    type: str | None = None,
    status: str | None = None,
    q: str | None = None,
    include_archived: bool = False,
) -> list[DocumentTemplate]:
    """One row per `template_group_id` — the highest `version` in that group."""
    latest_versions = (
        db.query(
            DocumentTemplate.template_group_id,
            func.max(DocumentTemplate.version).label("max_version"),
        )
        .filter(DocumentTemplate.is_active == True)  # noqa: E712
        .group_by(DocumentTemplate.template_group_id)
        .subquery()
    )
    query = db.query(DocumentTemplate).join(
        latest_versions,
        (DocumentTemplate.template_group_id == latest_versions.c.template_group_id)
        & (DocumentTemplate.version == latest_versions.c.max_version),
    )
    if not include_archived:
        query = query.filter(DocumentTemplate.status != "archived")
    if type:
        query = query.filter(DocumentTemplate.type == type)
    if status:
        query = query.filter(DocumentTemplate.status == status)
    if q:
        query = query.filter(DocumentTemplate.name.ilike(f"%{q}%"))
    # Builtin row first (it's the permanent, always-present fallback), then most-recently updated.
    return query.order_by(desc(DocumentTemplate.is_builtin), desc(DocumentTemplate.updated_at)).all()


def list_versions(db: Session, template_group_id: uuid.UUID) -> list[DocumentTemplate]:
    return (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.template_group_id == template_group_id, DocumentTemplate.is_active == True)  # noqa: E712
        .order_by(desc(DocumentTemplate.version))
        .all()
    )


def create(
    db: Session,
    *,
    name: str,
    description: str | None,
    type: str,
    created_by: uuid.UUID,
) -> DocumentTemplate:
    template = DocumentTemplate(
        template_group_id=uuid.uuid4(),
        name=name,
        description=description,
        type=type,
        status="draft",
        version=1,
        document=_default_document(),
        created_by=created_by,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update(db: Session, template: DocumentTemplate, **kwargs: Any) -> DocumentTemplate:
    for key, value in kwargs.items():
        if value is not None:
            setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return template


def get_draft_in_group(db: Session, template_group_id: uuid.UUID) -> DocumentTemplate | None:
    return (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.template_group_id == template_group_id,
            DocumentTemplate.status == "draft",
            DocumentTemplate.is_active == True,  # noqa: E712
        )
        .first()
    )


def create_new_version(db: Session, source: DocumentTemplate, *, created_by: uuid.UUID) -> DocumentTemplate:
    """Branches a new draft version off `source` (typically a published template). Carries
    `is_default`/`is_enabled` forward so editing a template that's currently the default doesn't
    silently un-default it the moment the draft is published — see `publish()`."""
    next_version = (
        db.query(func.max(DocumentTemplate.version))
        .filter(DocumentTemplate.template_group_id == source.template_group_id)
        .scalar()
        or source.version
    ) + 1
    clone = DocumentTemplate(
        template_group_id=source.template_group_id,
        name=source.name,
        description=source.description,
        type=source.type,
        status="draft",
        version=next_version,
        document=source.document,
        is_default=source.is_default,
        is_enabled=source.is_enabled,
        created_by=created_by,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


def duplicate(db: Session, source: DocumentTemplate, *, name: str, created_by: uuid.UUID) -> DocumentTemplate:
    """Copies `source` into a brand-new, independent template (new group, version 1, draft)."""
    clone = DocumentTemplate(
        template_group_id=uuid.uuid4(),
        name=name,
        description=source.description,
        type=source.type,
        status="draft",
        version=1,
        document=source.document,
        created_by=created_by,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


def publish(db: Session, template: DocumentTemplate) -> DocumentTemplate:
    template.status = "published"
    template.published_at = datetime.now(timezone.utc)
    if template.is_default:
        # Only one row per group should carry the "current truth" is_default flag — the sibling
        # this just superseded (still `published`, now no longer latest) would otherwise still
        # match a raw `is_default=True` scan, even though get_default()/list_latest() already
        # ignore it once this row exists.
        db.query(DocumentTemplate).filter(
            DocumentTemplate.template_group_id == template.template_group_id,
            DocumentTemplate.id != template.id,
        ).update({"is_default": False})
    db.commit()
    db.refresh(template)
    return template


def archive(db: Session, template: DocumentTemplate) -> DocumentTemplate:
    template.status = "archived"
    template.is_default = False
    db.commit()
    db.refresh(template)
    return template


def get_builtin(db: Session, type: str) -> DocumentTemplate | None:
    return db.query(DocumentTemplate).filter(DocumentTemplate.type == type, DocumentTemplate.is_builtin.is_(True)).first()


def create_builtin(db: Session, *, name: str, description: str | None, type: str, document: dict[str, Any], created_by: uuid.UUID) -> DocumentTemplate:
    """Creates the one seeded "Open Gauge style" row for `type` — published immediately (no draft
    step; it's never edited in place), lazily created on first use rather than migration-seeded
    (a migration has no valid `created_by` user to reference on a fresh install). Callers must
    check `get_builtin()` first and set `is_default` afterward via `set_default()` if nothing else
    already holds it — see template_defaults_service.py."""
    template = DocumentTemplate(
        template_group_id=uuid.uuid4(),
        name=name,
        description=description,
        type=type,
        status="published",
        version=1,
        document=document,
        is_builtin=True,
        created_by=created_by,
        published_at=datetime.now(timezone.utc),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def get_default(db: Session, type: str) -> DocumentTemplate | None:
    """The current default among *latest published* rows for `type` — deliberately scans
    `list_latest()`'s result rather than a raw `is_default=True` query, since a superseded
    (non-latest) version can still carry a stale `is_default=True` from before it was edited."""
    for t in list_latest(db, type=type, status="published"):
        if t.is_default and t.is_enabled:
            return t
    return None

def clear_default(db: Session, type: str) -> None:
    db.query(DocumentTemplate).filter(DocumentTemplate.type == type, DocumentTemplate.is_default.is_(True)).update({"is_default": False})
    db.commit()


def set_default(db: Session, template: DocumentTemplate) -> DocumentTemplate:
    clear_default(db, template.type)
    template.is_default = True
    template.is_enabled = True
    db.commit()
    db.refresh(template)
    return template


def set_enabled(db: Session, template: DocumentTemplate, enabled: bool) -> DocumentTemplate:
    template.is_enabled = enabled
    if not enabled:
        template.is_default = False
    db.commit()
    db.refresh(template)
    return template
