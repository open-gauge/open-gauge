import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...models.calibration_method import Procedure
from ...repositories import calibration as cal_repo
from ...repositories import asset as asset_repo
from ...schemas.calibration import (
    AnalyzeRequest,
    AnalyzeResponse,
    AnalyzePointOut,
    CalibrationCreate,
    CalibrationPointResponse,
    CalibrationResponse,
)
from ...services.calibration_analysis import run_analysis

router = APIRouter(prefix="/calibrations", tags=["Calibrations"])


@router.get("/procedures")
def list_procedures(
    physical_quantity: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    q = db.query(Procedure)
    if physical_quantity:
        q = q.filter(Procedure.physical_quantity == physical_quantity)
    return [
        {"id": str(p.id), "name": p.name, "physical_quantity": p.physical_quantity}
        for p in q.order_by(Procedure.name).all()
    ]


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
            coverage_factor=body.coverage_factor,
            channel_accuracy_value=body.channel_accuracy_value,
            channel_accuracy_type=body.channel_accuracy_type,
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


@router.get("", response_model=list[CalibrationResponse])
def list_calibrations(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CalibrationResponse]:
    return cal_repo.list_calibrations(db, skip=skip, limit=limit)


@router.post("", response_model=CalibrationResponse, status_code=status.HTTP_201_CREATED)
def create_calibration(
    body: CalibrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalibrationResponse:
    asset = asset_repo.get_by_id(db, body.asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if body.calibration_version == 1:
        body = body.model_copy(
            update={"calibration_version": cal_repo.get_next_version(db, body.asset_id, body.sensor_id)}
        )

    return cal_repo.create_atomic(db, created_by=current_user.id, body=body)


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
