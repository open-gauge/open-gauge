from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetType
from ..models.audit_log import AuditLog
from ..models.calibration import Calibration
from ..models.calibration_method import Procedure
from ..models.daq import DAQ
from ..models.sensor import Sensor


_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def get_summary(db: Session) -> dict:
    from datetime import date, timedelta

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

    # Calibration status distribution
    today = date.today()
    due_soon_limit = today + timedelta(days=30)
    active_ids = {r[0] for r in db.query(Asset.id).filter(Asset.is_active.is_(True)).all()}
    latest_dues = dict(
        db.query(Calibration.asset_id, func.max(Calibration.due_date))
        .filter(Calibration.asset_id.in_(active_ids), Calibration.is_active.is_(True))
        .group_by(Calibration.asset_id)
        .all()
    )
    counts: dict[str, int] = {"valid": 0, "due_soon": 0, "expired": 0, "not_calibrated": 0}
    for aid in active_ids:
        if aid not in latest_dues:
            counts["not_calibrated"] += 1
        else:
            dd = latest_dues[aid]
            if dd < today:
                counts["expired"] += 1
            elif dd <= due_soon_limit:
                counts["due_soon"] += 1
            else:
                counts["valid"] += 1

    # Procedures
    total_procedures = db.query(func.count(Procedure.id)).filter(Procedure.is_active.is_(True)).scalar() or 0
    proc_rows = (
        db.query(Procedure.physical_quantity, func.count(Procedure.id))
        .filter(Procedure.is_active.is_(True))
        .group_by(Procedure.physical_quantity)
        .order_by(func.count(Procedure.id).desc())
        .all()
    )

    return {
        "registered_assets": total,
        "sensors": sensors,
        "daqs": daqs,
        "low_health_assets": low_health,
        "calibration_status_distribution": [
            {"status": k, "count": v} for k, v in counts.items()
        ],
        "procedures": total_procedures,
        "procedure_distribution": [
            {"type": row[0], "count": row[1]} for row in proc_rows
        ],
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


def get_activity(db: Session, days: int = 30, limit: int = 500) -> list[dict]:
    from ..models.user import User

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(AuditLog, User.name, User.role, User.id)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .filter(AuditLog.created_at >= since)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "actor_id": str(user_id) if user_id else None,
            "actor_email": log.actor_email,
            "actor_name": name,
            "actor_role": role.value if role else None,
            "action": log.action,
            "entity_asset_id": log.entity_asset_id,
            "created_at": log.created_at,
        }
        for log, name, role, user_id in rows
    ]


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

    # Subquery: most-recently-created calibration timestamp per asset
    latest_subq = (
        db.query(
            Calibration.asset_id,
            func.max(Calibration.created_at).label("max_ts"),
        )
        .filter(Calibration.is_active.is_(True))
        .group_by(Calibration.asset_id)
        .subquery()
    )

    # Only the latest calibration record per asset; filter by its due_date
    rows = (
        db.query(Calibration, Asset)
        .join(Asset, Calibration.asset_id == Asset.id)
        .join(
            latest_subq,
            and_(
                Calibration.asset_id == latest_subq.c.asset_id,
                Calibration.created_at == latest_subq.c.max_ts,
            ),
        )
        .filter(
            Asset.is_active.is_(True),
            Calibration.due_date >= start,
            Calibration.due_date <= end,
        )
        .order_by(Calibration.due_date.asc())
        .all()
    )
    return [
        {
            "id": str(asset.id),
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
        .filter(
            Calibration.is_active.is_(True),
            Calibration.calibration_date >= start,
            Calibration.calibration_date <= end,
        )
        .all()
    )
    due = (
        db.query(Calibration, Asset)
        .join(Asset, Calibration.asset_id == Asset.id)
        .filter(
            Calibration.is_active.is_(True),
            Calibration.due_date >= start,
            Calibration.due_date <= end,
        )
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
