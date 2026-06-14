from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetType
from ..models.audit_log import AuditLog
from ..models.calibration import Calibration
from ..models.daq import DAQ
from ..models.sensor import Sensor


_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def get_summary(db: Session) -> dict:
    total = db.query(func.count(Asset.id)).filter(Asset.is_active.is_(True)).scalar() or 0
    sensors = db.query(func.count(Asset.id)).filter(
        Asset.is_active.is_(True), Asset.asset_type == AssetType.sensor,
    ).scalar() or 0
    daqs = db.query(func.count(Asset.id)).filter(
        Asset.is_active.is_(True), Asset.asset_type == AssetType.daq,
    ).scalar() or 0
    low_health = db.query(func.count(Asset.id)).filter(
        Asset.is_active.is_(True), Asset.health_score < 70,
    ).scalar() or 0

    return {
        "registered_assets": total,
        "sensors": sensors,
        "daqs": daqs,
        "low_health_assets": low_health,
    }


def get_distribution(db: Session) -> list[dict]:
    rows = (
        db.query(Asset.asset_type, func.count(Asset.id))
        .filter(Asset.is_active.is_(True))
        .group_by(Asset.asset_type)
        .all()
    )
    return [{"type": str(row[0].value), "count": row[1]} for row in rows]


def get_asset_type_distribution(db: Session) -> dict:
    sensor_rows = (
        db.query(Sensor.physical_quantity, func.count(Sensor.id))
        .join(Asset, Sensor.asset_id == Asset.id)
        .filter(Asset.is_active.is_(True))
        .group_by(Sensor.physical_quantity)
        .order_by(func.count(Sensor.id).desc())
        .all()
    )
    daq_rows = (
        db.query(DAQ.daq_type, func.count(DAQ.id))
        .join(Asset, DAQ.asset_id == Asset.id)
        .filter(Asset.is_active.is_(True))
        .group_by(DAQ.daq_type)
        .order_by(func.count(DAQ.id).desc())
        .all()
    )
    return {
        "sensors": [{"type": row[0], "count": row[1]} for row in sensor_rows],
        "daqs":    [{"type": row[0], "count": row[1]} for row in daq_rows],
    }


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


def get_calibration_events(db: Session, months_past: int = 3, months_ahead: int = 13) -> list[dict]:
    now = datetime.now(timezone.utc).date()
    start = now - timedelta(days=months_past * 31)
    end = now + timedelta(days=months_ahead * 31)
    rows = (
        db.query(Calibration, Asset)
        .join(Asset, Calibration.asset_id == Asset.id)
        .filter(Calibration.due_date >= start, Calibration.due_date <= end)
        .order_by(Calibration.due_date.asc())
        .all()
    )
    return [
        {
            "asset_id": asset.asset_id,
            "name": asset.name,
            "due_date": cal.due_date.isoformat(),
        }
        for cal, asset in rows
    ]


def get_calendar_events(db: Session, year: int) -> list[dict]:
    start = date(year, 1, 1)
    end = date(year, 12, 31)

    performed = (
        db.query(Calibration, Asset)
        .join(Asset, Calibration.asset_id == Asset.id)
        .filter(Calibration.calibration_date >= start, Calibration.calibration_date <= end)
        .all()
    )
    due = (
        db.query(Calibration, Asset)
        .join(Asset, Calibration.asset_id == Asset.id)
        .filter(Calibration.due_date >= start, Calibration.due_date <= end)
        .all()
    )

    result: list[dict] = []
    for cal, asset in performed:
        result.append({
            "asset_id": asset.asset_id,
            "name": asset.name,
            "date": cal.calibration_date.isoformat(),
            "event_type": "performed",
        })
    for cal, asset in due:
        result.append({
            "asset_id": asset.asset_id,
            "name": asset.name,
            "date": cal.due_date.isoformat(),
            "event_type": "due",
        })
    return result
