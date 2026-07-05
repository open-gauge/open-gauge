import uuid

from sqlalchemy.orm import Session

from ..models.calibration import Calibration
from ..models.calibration_point import CalibrationData
from ..schemas.calibration import CalibrationCreate


def get_by_id(db: Session, cal_id: uuid.UUID) -> Calibration | None:
    return db.query(Calibration).filter(Calibration.id == cal_id).first()


def list_by_asset(db: Session, asset_pk: uuid.UUID, skip: int = 0, limit: int = 50) -> list[Calibration]:
    return (
        db.query(Calibration)
        .filter(Calibration.asset_id == asset_pk)
        .order_by(Calibration.calibration_date.desc(), Calibration.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_calibrations(db: Session, skip: int = 0, limit: int = 50) -> list[Calibration]:
    return db.query(Calibration).order_by(Calibration.created_at.desc()).offset(skip).limit(limit).all()


def get_next_version(db: Session, asset_id: uuid.UUID, sensor_id: uuid.UUID | None) -> int:
    from sqlalchemy import func as _func
    q = db.query(_func.max(Calibration.calibration_version)).filter(Calibration.asset_id == asset_id)
    if sensor_id:
        q = q.filter(Calibration.sensor_id == sensor_id)
    current_max = q.scalar()
    return (current_max or 0) + 1


def delete_calibration(db: Session, cal: Calibration) -> None:
    """Hard-delete a calibration and all its data points (admin-only operation)."""
    from ..models.calibration_point import CalibrationData
    # calibrations.calibration_data_id FK references one of the data rows; null it out
    # before the bulk DELETE or PostgreSQL raises a FK violation.
    cal.calibration_data_id = None
    db.flush()
    db.query(CalibrationData).filter(CalibrationData.calibration_id == cal.id).delete()
    db.delete(cal)
    db.commit()


def create_atomic(db: Session, created_by: uuid.UUID, body: CalibrationCreate) -> Calibration:
    """
    Atomically create a Calibration and all CalibrationData rows in one transaction.
    Sets calibration_data_id to the first data point created (if any).
    """
    data = body.model_dump(exclude={"points"})
    cal = Calibration(created_by=created_by, **data)
    db.add(cal)
    db.flush()

    first_point_id: uuid.UUID | None = None
    for pt in body.points:
        pt_data = pt.model_dump()
        pt_data["calibration_id"] = cal.id
        row = CalibrationData(**pt_data)
        db.add(row)
        db.flush()
        if first_point_id is None:
            first_point_id = row.id

    if first_point_id is not None:
        cal.calibration_data_id = first_point_id

    db.commit()
    db.refresh(cal)
    return cal


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Calibration:
    cal = Calibration(created_by=created_by, **kwargs)
    db.add(cal)
    db.commit()
    db.refresh(cal)
    return cal


def list_points(db: Session, calibration_id: uuid.UUID) -> list[CalibrationData]:
    return (
        db.query(CalibrationData)
        .filter(CalibrationData.calibration_id == calibration_id)
        .order_by(CalibrationData.point_index)
        .all()
    )
