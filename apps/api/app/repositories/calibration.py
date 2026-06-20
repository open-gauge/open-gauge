import uuid

from sqlalchemy.orm import Session

from ..models.calibration import Calibration
from ..models.calibration_coefficient import CalibrationCoefficient, CoefficientType
from ..models.calibration_point import CalibrationPoint
from ..schemas.calibration import CalibrationCreate


def get_by_id(db: Session, cal_id: uuid.UUID) -> Calibration | None:
    return db.query(Calibration).filter(Calibration.id == cal_id).first()


def list_by_asset(db: Session, asset_pk: uuid.UUID, skip: int = 0, limit: int = 50) -> list[Calibration]:
    return (
        db.query(Calibration)
        .filter(Calibration.asset_id == asset_pk)
        .order_by(Calibration.calibration_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_calibrations(db: Session, skip: int = 0, limit: int = 50) -> list[Calibration]:
    return db.query(Calibration).order_by(Calibration.created_at.desc()).offset(skip).limit(limit).all()


def get_next_version(db: Session, asset_id: uuid.UUID, sensor_id: uuid.UUID | None) -> int:
    """Return the next version number for a (asset_id, sensor_id) pair."""
    q = db.query(Calibration).filter(Calibration.asset_id == asset_id)
    if sensor_id:
        q = q.filter(Calibration.sensor_id == sensor_id)
    count = q.count()
    return count + 1


def create_atomic(db: Session, created_by: uuid.UUID, body: CalibrationCreate) -> Calibration:
    """
    Atomically create a Calibration, optional CalibrationCoefficient, and
    all CalibrationPoint rows in a single transaction.
    """
    data = body.model_dump(exclude={"coefficient", "points"})
    cal = Calibration(created_by=created_by, **data)
    db.add(cal)
    db.flush()  # get cal.id before creating related rows

    if body.coefficient is not None:
        coeff_data = body.coefficient.model_dump()
        # Determine coefficient_type from poly_degree
        deg = coeff_data.get("poly_degree", 1)
        coeff_data["coefficient_type"] = CoefficientType.linear if deg == 1 else CoefficientType.polynomial
        coeff_data["calibration_id"] = cal.id
        # Copy expanded_uncertainty to legacy uncertainty column
        if coeff_data.get("expanded_uncertainty") is not None:
            coeff_data["uncertainty"] = coeff_data["expanded_uncertainty"]
        db.add(CalibrationCoefficient(**coeff_data))

    for pt in body.points:
        pt_data = pt.model_dump()
        pt_data["calibration_id"] = cal.id
        db.add(CalibrationPoint(**pt_data))

    db.commit()
    db.refresh(cal)
    return cal


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Calibration:
    cal = Calibration(created_by=created_by, **kwargs)
    db.add(cal)
    db.commit()
    db.refresh(cal)
    return cal


def list_coefficients(db: Session, calibration_id: uuid.UUID) -> list[CalibrationCoefficient]:
    return db.query(CalibrationCoefficient).filter(CalibrationCoefficient.calibration_id == calibration_id).all()


def list_points(db: Session, calibration_id: uuid.UUID) -> list[CalibrationPoint]:
    return (
        db.query(CalibrationPoint)
        .filter(CalibrationPoint.calibration_id == calibration_id)
        .order_by(CalibrationPoint.point_index)
        .all()
    )


def create_coefficient(db: Session, **kwargs) -> CalibrationCoefficient:
    coeff = CalibrationCoefficient(**kwargs)
    db.add(coeff)
    db.commit()
    db.refresh(coeff)
    return coeff
