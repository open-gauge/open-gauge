import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.calibration_method import Procedure
from ...models.user import User
from ...repositories import asset as asset_repo
from ...repositories import audit_log as audit_log_repo
from ...repositories import calibration as cal_repo
from ...repositories import stored_file as sf_repo
from ...schemas.calibration import (
    AnalyzePointOut,
    AnalyzeRequest,
    AnalyzeResponse,
    CalibrationCreate,
    CalibrationPointResponse,
    CalibrationResponse,
)
from ...services import notifications as notification_svc
from ...services.calibration_analysis import run_analysis
from ...services.storage import delete_file, get_presigned_url, sha256_hex, upload_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calibrations", tags=["Calibrations"])


# ---------------------------------------------------------------------------
# Procedures
# ---------------------------------------------------------------------------

@router.get("/procedures")
def list_procedures(
    physical_quantity: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    q = db.query(Procedure).filter(Procedure.is_active == True)  # noqa: E712
    if physical_quantity:
        q = q.filter(Procedure.physical_quantity == physical_quantity)
    return [
        {"id": str(p.id), "name": p.name, "physical_quantity": p.physical_quantity}
        for p in q.order_by(Procedure.proc_id.nullslast(), Procedure.name).all()
    ]


# ---------------------------------------------------------------------------
# Analysis (ephemeral)
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_calibration(
    body: AnalyzeRequest,
    _: User = Depends(get_current_user),
) -> AnalyzeResponse:
    """Ephemeral analysis — runs regression and returns statistics without saving."""
    try:
        result = run_analysis(
            reference_values=[p.reference for p in body.points],
            measured_values=[p.measured for p in body.points],
            reference_unit=body.reference_unit,
            measured_unit=body.measured_unit,
            poly_degree=body.poly_degree,
            distribution_type=body.distribution_type,  # type: ignore[arg-type]
            confidence_level=body.confidence_level,
            channel_accuracy_value=body.channel_accuracy_value,
            channel_accuracy_type=body.channel_accuracy_type,
            reference_standard_uncertainty=body.reference_standard_uncertainty,
            reference_standard_coverage_factor=body.reference_standard_coverage_factor,
            resolution=body.resolution,
            sensor_nominal_uncertainty=body.sensor_nominal_uncertainty,
            sensor_nominal_coverage_factor=body.sensor_nominal_coverage_factor,
            include_sensor_nominal_uncertainty=body.include_sensor_nominal_uncertainty,
            decision_rule=body.decision_rule,  # type: ignore[arg-type]
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    return AnalyzeResponse(
        poly_degree=result.poly_degree,
        coefficients=result.coefficients,
        r_squared=result.r_squared,
        rmse=result.rmse,
        standard_error=result.standard_error,
        max_error=result.max_error,
        full_scale_error_pct=result.full_scale_error_pct,
        non_linearity_pct=result.non_linearity_pct,
        repeatability=result.repeatability,
        hysteresis=result.hysteresis,
        combined_uncertainty=result.combined_uncertainty,
        expanded_uncertainty=result.expanded_uncertainty,
        distribution_type=result.distribution_type,
        confidence_level=result.confidence_level,
        coverage_factor=result.coverage_factor,
        valid_range_min=result.valid_range_min,
        valid_range_max=result.valid_range_max,
        passed=result.passed,
        conformity_statement=result.conformity_statement,
        uncertainty_budget=result.uncertainty_budget,
        effective_degrees_of_freedom=result.effective_degrees_of_freedom,
        poly_coefficients_covariance=result.poly_coefficients_covariance,
        points=[
            AnalyzePointOut(
                point_index=p.point_index,
                reference_value=p.reference_value,
                measured_value=p.measured_value,
                calculated_value=p.calculated_value,
                residual_abs=p.residual_abs,
                residual_pct=p.residual_pct,
            )
            for p in result.points
        ],
    )


# ---------------------------------------------------------------------------
# Calibration CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[CalibrationResponse])
def list_calibrations(
    skip: int = 0,
    limit: int = 50,
    include_voided: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CalibrationResponse]:
    """List calibration records across all assets. Voided calibrations are
    excluded unless include_voided=true."""
    return cal_repo.list_calibrations(db, skip=skip, limit=limit, include_voided=include_voided)


@router.post("", response_model=CalibrationResponse, status_code=status.HTTP_201_CREATED)
def create_calibration(
    body: CalibrationCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalibrationResponse:
    """Record a new calibration. calibration_version is assigned automatically as
    the record's chronological position (by calibration_date) among this asset's
    (or asset/sensor's) history — not by insertion order — so backfilling an
    older date correctly renumbers later records rather than always ranking last."""
    asset = asset_repo.get_by_id(db, body.asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    cal = cal_repo.create_atomic(db, created_by=current_user.id, body=body)

    # calibration_version is entirely server-computed: it's the chronological rank
    # (by calibration_date) of every calibration in this asset/sensor's history, not
    # an insertion-order counter — so a backfilled older date correctly slots in and
    # shifts later records up, rather than always landing on the highest number.
    cal_repo.renumber_versions(db, cal.asset_id, cal.sensor_id)
    db.commit()
    db.refresh(cal)

    # Generate and store the certificate (best-effort; never fail the creation)
    try:
        _generate_and_store_certificate(db, cal, current_user.id)
    except Exception:
        logger.warning("Certificate generation failed for calibration %s", cal.id, exc_info=True)

    db.refresh(cal)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="calibration.created",
        entity_type="calibration",
        entity_id=cal.id,
        entity_asset_id=asset.asset_id,
        after_state={
            "calibration_version": cal.calibration_version,
            "calibration_type": cal.calibration_type,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    background_tasks.add_task(notification_svc.notify_new_calibration, cal.id, current_user.id)

    return cal


@router.get("/{cal_id}", response_model=CalibrationResponse)
def get_calibration(
    cal_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CalibrationResponse:
    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    return cal


@router.get("/{cal_id}/points", response_model=list[CalibrationPointResponse])
def list_points(
    cal_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CalibrationPointResponse]:
    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    return cal_repo.list_points(db, cal_id)


def _require_admin(current_user: User) -> None:
    if not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.delete("/{cal_id}", status_code=status.HTTP_204_NO_CONTENT)
def void_calibration(
    cal_id: uuid.UUID,
    request: Request,
    reason: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Mark a calibration invalid rather than deleting it. Calibration history is
    never destroyed (see AGENTS.md's calibration philosophy): the record, its data
    points, and its certificate are all preserved. A voided calibration is hidden
    from listings by default, excluded from due-date/status calculations, and
    excluded from drift/health analysis, until an admin restores it.
    Restricted to admin and superadmin."""
    _require_admin(current_user)

    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    if not cal.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Calibration is already voided")

    asset = asset_repo.get_by_id(db, cal.asset_id)

    cal_repo.void_calibration(db, cal, voided_by=current_user.id, reason=reason)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="calibration.voided",
        entity_type="calibration",
        entity_id=cal_id,
        entity_asset_id=asset.asset_id if asset else None,
        before_state={"is_active": True},
        after_state={"is_active": False, "void_reason": reason},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/{cal_id}/restore", response_model=CalibrationResponse)
def restore_calibration(
    cal_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalibrationResponse:
    """Reinstate a previously voided calibration. Restricted to admin and superadmin."""
    _require_admin(current_user)

    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    if cal.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Calibration is not voided")

    asset = asset_repo.get_by_id(db, cal.asset_id)

    cal_repo.restore_calibration(db, cal)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="calibration.restored",
        entity_type="calibration",
        entity_id=cal_id,
        entity_asset_id=asset.asset_id if asset else None,
        before_state={"is_active": False},
        after_state={"is_active": True},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return cal


@router.get("/{cal_id}/certificate")
def get_certificate(
    cal_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> JSONResponse:
    """Return a 1-hour presigned download URL for the calibration certificate PDF."""
    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")

    if not cal.calibration_file_id:
        # Certificate hasn't been generated yet — attempt on-demand generation
        try:
            _generate_and_store_certificate(db, cal, cal.created_by)
            db.refresh(cal)
        except Exception:
            logger.warning("On-demand certificate generation failed for %s", cal_id, exc_info=True)

    if not cal.calibration_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not available for this calibration",
        )

    file_rec = sf_repo.get_by_id(db, cal.calibration_file_id)
    if not file_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate file record not found")

    url = get_presigned_url(file_rec.storage_path, file_rec.bucket)
    if not url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storage unavailable")

    return JSONResponse({"url": url, "filename": file_rec.original_filename})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _generate_and_store_certificate(db: Session, cal: "object", uploaded_by: uuid.UUID) -> None:  # type: ignore[type-arg]
    """Generate the certificate PDF and persist it to MinIO + files table.

    Updates cal.calibration_file_id in-place (commits the FK).
    Replaces any existing certificate file record for this calibration.
    """
    from ...models.calibration import Calibration  # local import to avoid circular
    from ...services.certificate_service import generate_certificate

    assert isinstance(cal, Calibration)

    asset = asset_repo.get_by_id(db, cal.asset_id)
    if not asset:
        raise ValueError(f"Asset {cal.asset_id} not found")

    points = cal_repo.list_points(db, cal.id)

    procedure: object = None
    if cal.internal_procedure_id:
        procedure = db.query(Procedure).filter(Procedure.id == cal.internal_procedure_id).first()

    reference_asset = None
    if cal.internal_reference_asset_id:
        reference_asset = asset_repo.get_by_id(db, cal.internal_reference_asset_id)

    sensor = None
    if cal.sensor_id:
        from ...models.sensor import Sensor
        sensor = db.query(Sensor).filter(Sensor.id == cal.sensor_id).first()

    # calibration_version is already the correct chronological position by the time
    # the certificate is generated (create_calibration renumbers before calling this).
    version = cal.calibration_version

    pdf_bytes = generate_certificate(
        asset=asset,
        calibration=cal,
        points=points,
        procedure=procedure,  # type: ignore[arg-type]
        reference_asset=reference_asset,
        sensor=sensor,
        version=version,
        app_base_url=settings.frontend_url,
    )

    filename = f"certificate_{asset.asset_id}_v{version}.pdf"
    object_path = f"certificates/{asset.asset_id}/{cal.id}/{filename}"
    checksum = sha256_hex(pdf_bytes)

    # Replace existing file if present
    if cal.calibration_file_id:
        old_rec = sf_repo.get_by_id(db, cal.calibration_file_id)
        if old_rec:
            delete_file(old_rec.storage_path, old_rec.bucket)
            sf_repo.delete(db, cal.calibration_file_id)

    bucket, path, size = upload_file(pdf_bytes, "application/pdf", object_path)

    file_rec = sf_repo.create(
        db,
        original_filename=filename,
        storage_path=path,
        bucket=bucket,
        content_type="application/pdf",
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="calibration_certificate",
        entity_id=cal.id,
        uploaded_by=uploaded_by,
    )

    cal.calibration_file_id = file_rec.id
    db.commit()
