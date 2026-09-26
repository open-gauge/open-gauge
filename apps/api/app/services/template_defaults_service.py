"""
Lazily seeds the one "Open Gauge style" built-in row per template kind (a `.tex` CertificateTemplate
for calibration reports, a WYSIWYG DocumentTemplate for procedures), and centralizes the "exactly
one enabled+published template is the default" invariant — including the cross-table case for
calibration reports, where either a legacy `.tex` template or an editor (JSON) template can hold
the default.

Why lazy rather than migration-seeded: both tables' `created_by` is a NOT NULL FK to `users`, and a
fresh install runs migrations before any user exists — there's no valid value to seed with at
migration time. `ensure_builtin_*` is cheap and idempotent (a single indexed lookup once it
exists), so it's called wherever a template needs to be listed or resolved for real.

The base (builtin) row is a normal row with `is_builtin=True` — not a synthetic/virtual entry —
so "mark as default" / "enable/disable" reuse the exact same code paths as any other template.
Only editing its content and deleting it are blocked (enforced in the API routers).
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Literal

from sqlalchemy.orm import Session

from ..repositories import certificate_template as certtpl_repo
from ..repositories import document_template as doctpl_repo
from ..repositories import stored_file as file_repo
from ..services import latex_service
from ..services import storage as storage_svc
from ..services.procedure_document import default_procedure_document

if TYPE_CHECKING:
    from ..models.certificate_template import CertificateTemplate
    from ..models.document_template import DocumentTemplate

BUILTIN_NAME = "Open Gauge (default)"
BUILTIN_CERTIFICATE_DESCRIPTION = "The built-in Open Gauge calibration report layout. Cannot be edited or deleted."
BUILTIN_PROCEDURE_DESCRIPTION = "The built-in Open Gauge procedure layout. Cannot be edited or deleted."


class BaseTemplateError(ValueError):
    """Raised for an action that would violate the base-template invariants (edit/delete a
    builtin row, or disable the builtin while it's the only default)."""


# ---------------------------------------------------------------------------
# Lazy builtin creation
# ---------------------------------------------------------------------------

def ensure_builtin_certificate_template(db: Session, created_by: uuid.UUID) -> "CertificateTemplate":
    existing = certtpl_repo.get_builtin(db)
    if existing:
        return existing
    tex_bytes = latex_service.BUILTIN_TEMPLATE_PATH.read_bytes()
    checksum = storage_svc.sha256_hex(tex_bytes)
    object_path = storage_svc.unique_object_name("certificate-templates", "open-gauge-default.tex")
    bucket, path, size = storage_svc.upload_file(tex_bytes, "text/x-tex", object_path)
    file_record = file_repo.create(
        db,
        original_filename="open-gauge-default.tex",
        storage_path=path,
        bucket=bucket,
        content_type="text/x-tex",
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="certificate_template",
        entity_id=None,
        uploaded_by=created_by,
    )
    builtin = certtpl_repo.create_builtin(
        db,
        name=BUILTIN_NAME,
        description=BUILTIN_CERTIFICATE_DESCRIPTION,
        template_file_id=file_record.id,
        created_by=created_by,
    )
    if get_report_default(db) is None:
        certtpl_repo.set_default(db, builtin)
    return builtin


def ensure_builtin_procedure_template(db: Session, created_by: uuid.UUID) -> "DocumentTemplate":
    existing = doctpl_repo.get_builtin(db, type="procedure")
    if existing:
        return existing
    builtin = doctpl_repo.create_builtin(
        db,
        name=BUILTIN_NAME,
        description=BUILTIN_PROCEDURE_DESCRIPTION,
        type="procedure",
        document=default_procedure_document(),
        created_by=created_by,
    )
    if doctpl_repo.get_default(db, type="procedure") is None:
        doctpl_repo.set_default(db, builtin)
    return builtin


# ---------------------------------------------------------------------------
# Calibration reports: the default can be either kind — at most one, across both tables.
# ---------------------------------------------------------------------------

ReportTemplateRef = tuple[Literal["certificate", "document"], uuid.UUID]


def get_report_default(db: Session) -> ReportTemplateRef | None:
    doc_default = doctpl_repo.get_default(db, type="certificate")
    if doc_default:
        return ("document", doc_default.id)
    cert_default = certtpl_repo.get_default(db)
    if cert_default:
        return ("certificate", cert_default.id)
    return None


def set_report_default(
    db: Session, *, certificate_template_id: uuid.UUID | None = None, document_template_id: uuid.UUID | None = None,
) -> None:
    """Marks exactly one of the two given rows as the calibration-report default, clearing it on
    every other row of either kind. Exactly one of the two ids must be given."""
    if document_template_id is not None:
        template = doctpl_repo.get_by_id(db, document_template_id)
        if not template or template.type != "certificate" or template.status != "published":
            raise ValueError("Document template not found or not published")
        certtpl_repo.unset_default(db, None)
        doctpl_repo.set_default(db, template)
        return
    if certificate_template_id is not None:
        cert = certtpl_repo.get_by_id(db, certificate_template_id)
        if not cert or not cert.is_active:
            raise ValueError("Certificate template not found")
        doctpl_repo.clear_default(db, "certificate")
        certtpl_repo.set_default(db, cert)
        return
    raise ValueError("No template given")


def ensure_report_default_fallback(db: Session, created_by: uuid.UUID) -> None:
    """After the report default is deleted/disabled, fall back to the builtin (creating it first
    if it somehow doesn't exist yet) rather than leaving no default at all."""
    if get_report_default(db) is not None:
        return
    builtin = ensure_builtin_certificate_template(db, created_by)
    if not builtin.is_default:
        certtpl_repo.set_default(db, builtin)


def ensure_procedure_default_fallback(db: Session, created_by: uuid.UUID) -> None:
    if doctpl_repo.get_default(db, type="procedure") is not None:
        return
    builtin = ensure_builtin_procedure_template(db, created_by)
    if not builtin.is_default:
        doctpl_repo.set_default(db, builtin)


def assert_can_disable(is_builtin: bool, is_default: bool) -> None:
    """Raises BaseTemplateError if disabling a template would leave its kind with no possible
    default at all — only reachable for the builtin row (disabling any other default row always
    has the builtin to fall back to)."""
    if is_builtin and is_default:
        raise BaseTemplateError(
            "The base template cannot be deactivated while it is the default — mark another template as default first."
        )
