import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.calibration import Calibration
from ..models.calibration_frequency_point import CalibrationFrequencyPoint
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


def get_next_version(db: Session, asset_id: uuid.UUID, sensor_id: uuid.UUID | None) -> int:
    """Next calibration_version for this (asset[, sensor]) scope: MAX+1.

    Versions are an always-increasing, unique, insertion-order counter — not tied
    to calibration_date — so backfilling an older-dated calibration never renumbers
    any existing record. Includes voided calibrations, so a voided version number
    is never reissued to a new record.
    """
    q = db.query(func.max(Calibration.calibration_version)).filter(Calibration.asset_id == asset_id)
    if sensor_id is not None:
        q = q.filter(Calibration.sensor_id == sensor_id)
    current_max = q.scalar()
    return (current_max or 0) + 1


def void_calibration(
    db: Session, cal: Calibration, voided_by: uuid.UUID, reason: str | None = None
) -> Calibration:
    """Mark a calibration invalid. The record, its data points, and its
    certificate are all preserved — only its validity flag changes. Reachable
    from any status (an admin override that always wins)."""
    cal.status = "void"
    cal.is_active = False
    cal.voided_at = datetime.now(timezone.utc)
    cal.voided_by = voided_by
    cal.void_reason = reason
    db.commit()
    db.refresh(cal)
    return cal


def restore_calibration(db: Session, cal: Calibration) -> Calibration:
    """Reinstate a previously voided calibration. Always restores to "valid" —
    it does not attempt to resurrect a rejected calibration back to
    "rejected"; that's out of scope (a corrected calibration is a new row)."""
    cal.status = "valid"
    cal.is_active = True
    cal.voided_at = None
    cal.voided_by = None
    cal.void_reason = None
    db.commit()
    db.refresh(cal)
    return cal


def approve_calibration(db: Session, cal: Calibration, decided_by: uuid.UUID) -> Calibration:
    """The assigned checker (or an admin override) approves a pending calibration."""
    cal.status = "valid"
    cal.is_active = True
    cal.decided_by = decided_by
    cal.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cal)
    return cal


def reject_calibration(
    db: Session, cal: Calibration, decided_by: uuid.UUID, reason: str | None = None
) -> Calibration:
    """The assigned checker (or an admin override) rejects a pending calibration."""
    cal.status = "rejected"
    cal.is_active = False
    cal.decided_by = decided_by
    cal.decided_at = datetime.now(timezone.utc)
    cal.decision_reason = reason
    db.commit()
    db.refresh(cal)
    return cal


def create_atomic(db: Session, created_by: uuid.UUID, body: CalibrationCreate) -> Calibration:
    """
    Atomically create a Calibration and all CalibrationData/CalibrationFrequencyPoint
    rows in one transaction. Sets calibration_data_id to the first *primary* data
    point created (if any) — as_found_points (data_entry_mode=
    reference_vs_as_found_as_left's diagnostic pre-repair dataset) are written with
    point_role="as_found" and never become calibration_data_id, since as-left is
    this record's primary/official result (see Calibration.as_found_summary).
    A calibration with a checked_by_user_id starts "pending_approval"
    (is_active=False) instead of "valid" — it isn't used until the checker decides.
    """
    data = body.model_dump(exclude={"points", "frequency_response_points", "as_found_points"})
    cal_status = "pending_approval" if body.checked_by_user_id else "valid"
    cal = Calibration(created_by=created_by, status=cal_status, is_active=(cal_status == "valid"), **data)
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

    for pt in body.as_found_points:
        pt_data = pt.model_dump()
        pt_data["calibration_id"] = cal.id
        pt_data["point_role"] = "as_found"
        db.add(CalibrationData(**pt_data))

    for fp in body.frequency_response_points:
        fp_data = fp.model_dump()
        fp_data["calibration_id"] = cal.id
        db.add(CalibrationFrequencyPoint(**fp_data))

    db.commit()
    db.refresh(cal)
    return cal


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Calibration:
    cal = Calibration(created_by=created_by, **kwargs)
    db.add(cal)
    db.commit()
    db.refresh(cal)
    return cal


def list_points(
    db: Session, calibration_id: uuid.UUID, point_role: str = "primary"
) -> list[CalibrationData]:
    return (
        db.query(CalibrationData)
        .filter(
            CalibrationData.calibration_id == calibration_id,
            CalibrationData.point_role == point_role,
        )
        .order_by(CalibrationData.point_index)
        .all()
    )


def list_frequency_points(db: Session, calibration_id: uuid.UUID) -> list[CalibrationFrequencyPoint]:
    return (
        db.query(CalibrationFrequencyPoint)
        .filter(CalibrationFrequencyPoint.calibration_id == calibration_id)
        .order_by(CalibrationFrequencyPoint.sweep_index)
        .all()
    )
