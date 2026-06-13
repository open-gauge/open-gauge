from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetCategory, CalibrationStatus
from ..models.audit_log import AuditLog
from ..models.calibration_throughput import CalibrationThroughput
from ..models.data_acquisition import DataAcquisition
from ..models.instrument import Instrument
from ..models.sensor import Sensor

_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def get_summary(db: Session) -> dict:
    total = db.query(func.count(Asset.id)).filter(Asset.is_active.is_(True)).scalar() or 0
    valid = db.query(func.count(Asset.id)).filter(
        Asset.is_active.is_(True),
        Asset.calibration_status == CalibrationStatus.valid,
    ).scalar() or 0
    due_soon = db.query(func.count(Asset.id)).filter(
        Asset.is_active.is_(True),
        Asset.calibration_status == CalibrationStatus.due_soon,
    ).scalar() or 0
    expired = db.query(func.count(Asset.id)).filter(
        Asset.is_active.is_(True),
        Asset.calibration_status == CalibrationStatus.expired,
    ).scalar() or 0

    return {
        "registered_assets": total,
        "valid_calibrations": valid,
        "valid_coverage_pct": round(valid / total * 100) if total else 0,
        "due_within_30_days": due_soon,
        "expired": expired,
    }


def get_throughput(db: Session) -> list[dict]:
    records = (
        db.query(CalibrationThroughput)
        .order_by(CalibrationThroughput.year, CalibrationThroughput.month)
        .all()
    )
    return [
        {
            "month": _MONTH_LABELS[r.month - 1],
            "completed": r.completed_count,
            "expired": r.expired_count,
        }
        for r in records
    ]


def get_distribution(db: Session) -> list[dict]:
    rows = (
        db.query(Asset.category, func.count(Asset.id))
        .filter(Asset.is_active.is_(True))
        .group_by(Asset.category)
        .all()
    )
    return [{"type": str(row[0].value), "count": row[1]} for row in rows]


def get_category_distribution(db: Session) -> list[dict]:
    sensor_rows = (
        db.query(Sensor.sensor_type, func.count(Sensor.id))
        .join(Asset, Asset.id == Sensor.asset_id)
        .filter(Asset.is_active.is_(True))
        .group_by(Sensor.sensor_type)
        .all()
    )
    instrument_rows = (
        db.query(Instrument.instrument_type, func.count(Instrument.id))
        .join(Asset, Asset.id == Instrument.asset_id)
        .filter(Asset.is_active.is_(True))
        .group_by(Instrument.instrument_type)
        .all()
    )
    ref_total = (
        db.query(func.count(Asset.id))
        .filter(Asset.is_active.is_(True), Asset.category == AssetCategory.reference_standard)
        .scalar() or 0
    )
    daq_rows = (
        db.query(DataAcquisition.daq_type, func.count(DataAcquisition.id))
        .join(Asset, Asset.id == DataAcquisition.asset_id)
        .filter(Asset.is_active.is_(True))
        .group_by(DataAcquisition.daq_type)
        .all()
    )
    return [
        {
            "category": "sensor",
            "total": sum(r[1] for r in sensor_rows),
            "items": [{"type": r[0].value, "count": r[1]} for r in sensor_rows],
        },
        {
            "category": "instrument",
            "total": sum(r[1] for r in instrument_rows),
            "items": [{"type": r[0].value, "count": r[1]} for r in instrument_rows],
        },
        {
            "category": "reference_standard",
            "total": ref_total,
            "items": [{"type": "reference_standard", "count": ref_total}] if ref_total > 0 else [],
        },
        {
            "category": "data_acquisition",
            "total": sum(r[1] for r in daq_rows),
            "items": [{"type": r[0].value, "count": r[1]} for r in daq_rows],
        },
    ]


def get_upcoming(db: Session, limit: int = 10) -> list[Asset]:
    return (
        db.query(Asset)
        .filter(
            Asset.is_active.is_(True),
            Asset.calibration_status.in_([CalibrationStatus.due_soon, CalibrationStatus.expired]),
        )
        .order_by(Asset.health_score.asc())
        .limit(limit)
        .all()
    )


def get_activity(db: Session, limit: int = 10) -> list[AuditLog]:
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()


def get_recent_assets(db: Session, limit: int = 10) -> list[Asset]:
    return (
        db.query(Asset)
        .filter(Asset.is_active.is_(True))
        .order_by(Asset.updated_at.desc())
        .limit(limit)
        .all()
    )
