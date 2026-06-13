import uuid

from sqlalchemy.orm import Session

from ..models.calibration import Calibration
from ..models.calibration_coefficient import CalibrationCoefficient


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


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Calibration:
    cal = Calibration(created_by=created_by, **kwargs)
    db.add(cal)
    db.commit()
    db.refresh(cal)
    return cal


def list_coefficients(db: Session, calibration_id: uuid.UUID) -> list[CalibrationCoefficient]:
    return db.query(CalibrationCoefficient).filter(CalibrationCoefficient.calibration_id == calibration_id).all()


def create_coefficient(db: Session, **kwargs) -> CalibrationCoefficient:
    coeff = CalibrationCoefficient(**kwargs)
    db.add(coeff)
    db.commit()
    db.refresh(coeff)
    return coeff
