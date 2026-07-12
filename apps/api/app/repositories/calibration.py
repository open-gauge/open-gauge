import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.calibration import Calibration
from ..models.calibration_point import CalibrationData
from ..schemas.calibration import CalibrationCreate


def get_by_id(db: Session, cal_id: uuid.UUID) -> Calibration | None:
    return db.query(Calibration).filter(Calibration.id == cal_id).first()


def list_by_asset(
    db: Session,
    asset_pk: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
    include_voided: bool = False,
) -> list[Calibration]:
    q = db.query(Calibration).filter(Calibration.asset_id == asset_pk)
    if not include_voided:
        q = q.filter(Calibration.is_active.is_(True))
    return (
        q.order_by(Calibration.calibration_date.desc(), Calibration.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_calibrations(
    db: Session, skip: int = 0, limit: int = 50, include_voided: bool = False
) -> list[Calibration]:
    q = db.query(Calibration)
    if not include_voided:
        q = q.filter(Calibration.is_active.is_(True))
    return q.order_by(Calibration.created_at.desc()).offset(skip).limit(limit).all()


def renumber_versions(db: Session, asset_id: uuid.UUID, sensor_id: uuid.UUID | None) -> None:
    """Reassign calibration_version for every calibration in this (asset[, sensor])
    scope so it strictly reflects chronological order by calibration_date (1 = earliest).

    Runs after every create, since a backfilled (older) calibration_date can shift
    every later record's number up by one — versions are a chronological position,
    not an insertion-order counter. Voided calibrations are included: voiding doesn't
    rewrite where a record sits in history, only whether it's currently valid.
    """
    q = db.query(Calibration).filter(Calibration.asset_id == asset_id)
    if sensor_id is not None:
        q = q.filter(Calibration.sensor_id == sensor_id)
    rows = q.order_by(
        Calibration.calibration_date.asc(), Calibration.created_at.asc(), Calibration.id.asc()
    ).all()
    for i, row in enumerate(rows, start=1):
        if row.calibration_version != i:
            row.calibration_version = i
    db.flush()


def void_calibration(
    db: Session, cal: Calibration, voided_by: uuid.UUID, reason: str | None = None
) -> Calibration:
    """Mark a calibration invalid. The record, its data points, and its
    certificate are all preserved — only its validity flag changes."""
    cal.is_active = False
    cal.voided_at = datetime.now(timezone.utc)
    cal.voided_by = voided_by
    cal.void_reason = reason
    db.commit()
    db.refresh(cal)
    return cal


def restore_calibration(db: Session, cal: Calibration) -> Calibration:
    """Reinstate a previously voided calibration."""
    cal.is_active = True
    cal.voided_at = None
    cal.voided_by = None
    cal.void_reason = None
    db.commit()
    db.refresh(cal)
    return cal


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
