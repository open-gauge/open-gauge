import uuid

from sqlalchemy.orm import Session

from ..models.certificate_template import CertificateTemplate


def get_by_id(db: Session, template_id: uuid.UUID) -> CertificateTemplate | None:
    return db.query(CertificateTemplate).filter(CertificateTemplate.id == template_id).first()


def list_templates(
    db: Session, organization_id: uuid.UUID | None = None, include_global: bool = True
) -> list[CertificateTemplate]:
    q = db.query(CertificateTemplate).filter(CertificateTemplate.is_active.is_(True))
    if organization_id is not None:
        if include_global:
            q = q.filter(
                (CertificateTemplate.organization_id == organization_id)
                | (CertificateTemplate.organization_id.is_(None))
            )
        else:
            q = q.filter(CertificateTemplate.organization_id == organization_id)
    else:
        # organization_id=None means "global scope" — not "no filter at all".
        q = q.filter(CertificateTemplate.organization_id.is_(None))
    return q.order_by(CertificateTemplate.name).all()


def get_active_default(db: Session, organization_id: uuid.UUID | None) -> CertificateTemplate | None:
    return (
        db.query(CertificateTemplate)
        .filter(
            CertificateTemplate.organization_id == organization_id,
            CertificateTemplate.is_default.is_(True),
            CertificateTemplate.is_active.is_(True),
        )
        .first()
    )


def create(
    db: Session,
    *,
    organization_id: uuid.UUID | None,
    name: str,
    description: str | None,
    template_file_id: uuid.UUID,
    is_default: bool,
    created_by: uuid.UUID,
) -> CertificateTemplate:
    template = CertificateTemplate(
        organization_id=organization_id,
        name=name,
        description=description,
        template_file_id=template_file_id,
        is_default=is_default,
        created_by=created_by,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def unset_default(db: Session, organization_id: uuid.UUID | None) -> None:
    """Clear is_default on any currently-default template for this scope (org or global)."""
    db.query(CertificateTemplate).filter(
        CertificateTemplate.organization_id == organization_id,
        CertificateTemplate.is_default.is_(True),
    ).update({"is_default": False})
    db.commit()


def update(db: Session, template: CertificateTemplate, **kwargs) -> CertificateTemplate:
    for key, value in kwargs.items():
        if value is not None:
            setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return template


def deactivate(db: Session, template: CertificateTemplate) -> CertificateTemplate:
    template.is_active = False
    template.is_default = False
    db.commit()
    db.refresh(template)
    return template
