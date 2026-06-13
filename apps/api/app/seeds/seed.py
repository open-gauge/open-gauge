import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.security import hash_password
from ..models.asset import Asset, AssetCategory, CalibrationStatus
from ..models.audit_log import AuditLog
from ..models.calibration import Calibration, CalibrationResult
from ..models.calibration_coefficient import CalibrationCoefficient, CoefficientType
from ..models.calibration_throughput import CalibrationThroughput
from ..models.certificate import Certificate
from ..models.data_acquisition import DataAcquisition, DaqType
from ..models.instrument import Instrument, InstrumentType
from ..models.laboratory import Laboratory
from ..models.organization import Organization
from ..models.sensor import Sensor, SensorType
from ..models.site import Site
from ..models.user import User, UserRole


def seed_database(db: Session) -> None:
    if db.query(Asset).count() > 0:
        return

    now = datetime.now(timezone.utc)

    # Organization
    org = Organization(name="Demo Corp", description="MAR demonstration organization")
    db.add(org)
    db.flush()

    # Admin user
    admin = User(
        email="admin@mar.local",
        name="A. Lindberg",
        hashed_password=hash_password("mar-admin-2026"),
        role=UserRole.admin,
        organization_id=org.id,
        is_superuser=True,
    )
    db.add(admin)
    db.flush()

    # Technician user
    tech = User(
        email="tech@mar.local",
        name="M. Schmidt",
        hashed_password=hash_password("mar-tech-2026"),
        role=UserRole.technician,
        organization_id=org.id,
    )
    db.add(tech)
    db.flush()

    # Site
    plant = Site(
        organization_id=org.id,
        name="Main Plant",
        location="Sector A, Industrial Park",
        created_by=admin.id,
    )
    db.add(plant)
    db.flush()

    # Laboratories
    labs: dict[str, Laboratory] = {}
    for name in ["Reactor Room", "Loop 2", "Cleanroom Bay 3", "Pipeline Line 2",
                 "Boiler Unit 4", "Control Room", "Furnace Hall", "Cooling Tower B",
                 "Tank Farm", "Ambient Bay", "Old Vent Stack"]:
        lab = Laboratory(site_id=plant.id, name=name, created_by=admin.id)
        db.add(lab)
        db.flush()
        labs[name] = lab

    # Asset definitions — sensor_type / instrument_type / daq_type fields are popped before Asset()
    asset_rows = [
        # --- Sensors ---
        dict(asset_id="MAR-00421", name="Reactor Inlet PT-01", category=AssetCategory.sensor,
             manufacturer="Endress+Hauser", model="Cerabar PMP55",
             calibration_status=CalibrationStatus.valid, health_score=95,
             next_due_at=now + timedelta(days=180), calibration_interval_days=365,
             laboratory_id=labs["Reactor Room"].id,
             sensor_type=SensorType.pressure, measurement_unit="bar",
             output_signal="4–20", output_signal_unit="mA"),

        dict(asset_id="MAR-00422", name="Coolant Loop TT-12", category=AssetCategory.sensor,
             manufacturer="Omega", model="PR-21SL-3-100-A",
             calibration_status=CalibrationStatus.due_soon, health_score=82,
             next_due_at=datetime(2026, 6, 2, tzinfo=timezone.utc), calibration_interval_days=365,
             laboratory_id=labs["Loop 2"].id,
             sensor_type=SensorType.temperature, measurement_unit="°C",
             output_signal="4–20", output_signal_unit="mA"),

        dict(asset_id="MAR-00423", name="Cleanroom RH-Sensor", category=AssetCategory.sensor,
             manufacturer="Vaisala", model="HMP110",
             calibration_status=CalibrationStatus.valid, health_score=88,
             next_due_at=now + timedelta(days=120), calibration_interval_days=365,
             laboratory_id=labs["Cleanroom Bay 3"].id,
             sensor_type=SensorType.humidity, measurement_unit="%RH",
             measurement_range="0–100 %RH"),

        dict(asset_id="MAR-00424", name="Process Flow FT-08", category=AssetCategory.sensor,
             manufacturer="Siemens", model="SITRANS F M MAG 5100",
             calibration_status=CalibrationStatus.expired, health_score=41,
             next_due_at=datetime(2025, 11, 10, tzinfo=timezone.utc), calibration_interval_days=365,
             laboratory_id=labs["Pipeline Line 2"].id,
             sensor_type=SensorType.flow, measurement_unit="m³/h",
             measurement_range="0–500 m³/h"),

        dict(asset_id="MAR-00425", name="Boiler Output PT-04", category=AssetCategory.sensor,
             manufacturer="WIKA", model="S-20",
             calibration_status=CalibrationStatus.valid, health_score=92,
             next_due_at=now + timedelta(days=200), calibration_interval_days=365,
             laboratory_id=labs["Boiler Unit 4"].id,
             sensor_type=SensorType.pressure, measurement_unit="bar",
             measurement_range="0–25 bar"),

        dict(asset_id="MAR-00427", name="Furnace TT-22", category=AssetCategory.sensor,
             manufacturer="Yokogawa", model="EJX910A",
             calibration_status=CalibrationStatus.due_soon, health_score=76,
             next_due_at=datetime(2026, 5, 30, tzinfo=timezone.utc), calibration_interval_days=365,
             laboratory_id=labs["Furnace Hall"].id,
             sensor_type=SensorType.temperature, measurement_unit="°C",
             measurement_range="-20–600 °C"),

        dict(asset_id="MAR-00428", name="Cooling Tower RH-02", category=AssetCategory.sensor,
             manufacturer="Rotronic", model="HC2A",
             calibration_status=CalibrationStatus.valid, health_score=89,
             next_due_at=now + timedelta(days=150), calibration_interval_days=365,
             laboratory_id=labs["Cooling Tower B"].id,
             sensor_type=SensorType.humidity, measurement_unit="%RH"),

        dict(asset_id="MAR-00429", name="Cooling Water FT-14", category=AssetCategory.sensor,
             manufacturer="Endress+Hauser", model="Promag 50W",
             calibration_status=CalibrationStatus.valid, health_score=91,
             next_due_at=now + timedelta(days=160), calibration_interval_days=365,
             laboratory_id=labs["Cooling Tower B"].id,
             sensor_type=SensorType.flow, measurement_unit="m³/h"),

        dict(asset_id="MAR-00432", name="Tank Bottom TT-19", category=AssetCategory.sensor,
             manufacturer="WIKA", model="TR10-B",
             calibration_status=CalibrationStatus.expired, health_score=38,
             next_due_at=datetime(2025, 12, 4, tzinfo=timezone.utc), calibration_interval_days=365,
             laboratory_id=labs["Tank Farm"].id,
             sensor_type=SensorType.temperature, measurement_unit="°C"),

        dict(asset_id="MAR-00438", name="Ambient TT-38", category=AssetCategory.sensor,
             manufacturer="Fluke", model="1502A",
             calibration_status=CalibrationStatus.valid, health_score=100,
             next_due_at=now + timedelta(days=365), calibration_interval_days=365,
             laboratory_id=labs["Ambient Bay"].id,
             sensor_type=SensorType.temperature, measurement_unit="°C",
             measurement_range="-200–660 °C"),

        # Retired sensor
        dict(asset_id="MAR-00399", name="Exhaust Vent TT-99", category=AssetCategory.sensor,
             manufacturer="Honeywell", model="STT25H",
             calibration_status=CalibrationStatus.valid, health_score=60,
             next_due_at=now - timedelta(days=30), calibration_interval_days=365,
             laboratory_id=labs["Old Vent Stack"].id,
             is_active=False, retired_at=now - timedelta(days=2), retired_by=admin.id,
             retired_reason="Decommissioned",
             sensor_type=SensorType.temperature, measurement_unit="°C"),

        # --- Instruments ---
        dict(asset_id="MAR-00501", name="DPT Honeywell DPT-01", category=AssetCategory.instrument,
             manufacturer="Honeywell", model="STD924-A1AD",
             calibration_status=CalibrationStatus.valid, health_score=94,
             next_due_at=now + timedelta(days=210), calibration_interval_days=365,
             laboratory_id=labs["Reactor Room"].id,
             instrument_type=InstrumentType.transmitter,
             measurement_unit="Pa", measurement_range="0–10000 Pa",
             output_signal="4–20", output_signal_unit="mA"),

        dict(asset_id="MAR-00502", name="Temperature Controller TC-08", category=AssetCategory.instrument,
             manufacturer="Yokogawa", model="UT350",
             calibration_status=CalibrationStatus.valid, health_score=88,
             next_due_at=now + timedelta(days=310), calibration_interval_days=365,
             laboratory_id=labs["Control Room"].id,
             instrument_type=InstrumentType.controller,
             measurement_unit="°C", measurement_range="-200–1370 °C"),

        dict(asset_id="MAR-00503", name="Batch Flow Recorder FR-12", category=AssetCategory.instrument,
             manufacturer="ABB", model="KF550",
             calibration_status=CalibrationStatus.due_soon, health_score=71,
             next_due_at=datetime(2026, 6, 20, tzinfo=timezone.utc), calibration_interval_days=365,
             laboratory_id=labs["Pipeline Line 2"].id,
             instrument_type=InstrumentType.recorder,
             measurement_unit="m³/h", measurement_range="0–500 m³/h"),

        # --- Reference Standards ---
        dict(asset_id="MAR-00504", name="Reference Pressure Standard RPS-01",
             category=AssetCategory.reference_standard,
             manufacturer="WIKA", model="CPH7600",
             calibration_status=CalibrationStatus.valid, health_score=99,
             next_due_at=now + timedelta(days=300), calibration_interval_days=365,
             laboratory_id=labs["Control Room"].id),

        dict(asset_id="MAR-00505", name="Reference Thermometer RTD-01",
             category=AssetCategory.reference_standard,
             manufacturer="Fluke", model="1524",
             calibration_status=CalibrationStatus.valid, health_score=98,
             next_due_at=now + timedelta(days=240), calibration_interval_days=365,
             laboratory_id=labs["Ambient Bay"].id),

        # --- Data Acquisition ---
        dict(asset_id="MAR-00426", name="Gateway CO-01", category=AssetCategory.data_acquisition,
             manufacturer="ABB", model="Wireless HART Bridge",
             calibration_status=CalibrationStatus.valid, health_score=79,
             next_due_at=now + timedelta(days=90), calibration_interval_days=365,
             laboratory_id=labs["Control Room"].id,
             daq_type=DaqType.gateway, input_channels=8, communication_protocol="HART"),

        dict(asset_id="MAR-00506", name="Field Data Logger FDL-04",
             category=AssetCategory.data_acquisition,
             manufacturer="Honeywell", model="DL06",
             calibration_status=CalibrationStatus.valid, health_score=85,
             next_due_at=now + timedelta(days=170), calibration_interval_days=365,
             laboratory_id=labs["Tank Farm"].id,
             daq_type=DaqType.data_logger, input_channels=16, communication_protocol="Modbus RTU"),
    ]

    asset_map: dict[str, Asset] = {}
    for row in asset_rows:
        sensor_type = row.pop("sensor_type", None)
        measurement_unit = row.pop("measurement_unit", None)
        measurement_range = row.pop("measurement_range", None)
        output_signal = row.pop("output_signal", None)
        output_signal_unit = row.pop("output_signal_unit", None)
        instrument_type = row.pop("instrument_type", None)
        daq_type = row.pop("daq_type", None)
        input_channels = row.pop("input_channels", 0)
        communication_protocol = row.pop("communication_protocol", None)

        asset = Asset(created_by=admin.id, **row)
        db.add(asset)
        db.flush()
        asset_map[asset.asset_id] = asset

        if sensor_type:
            db.add(Sensor(
                asset_id=asset.id,
                sensor_type=sensor_type,
                measurement_unit=measurement_unit,
                measurement_range=measurement_range,
                output_signal=output_signal,
                output_signal_unit=output_signal_unit,
            ))
        if instrument_type:
            db.add(Instrument(
                asset_id=asset.id,
                instrument_type=instrument_type,
                measurement_unit=measurement_unit,
                measurement_range=measurement_range,
                output_signal=output_signal,
                output_signal_unit=output_signal_unit,
            ))
        if daq_type:
            db.add(DataAcquisition(
                asset_id=asset.id,
                daq_type=daq_type,
                input_channels=input_channels,
                output_channels=0,
                communication_protocol=communication_protocol,
            ))

    db.flush()

    # Calibrations — flush to get IDs for coefficients and certificates
    cal_pt01 = Calibration(
        asset_id=asset_map["MAR-00421"].id,
        calibration_date=date(2025, 12, 10),
        due_date=date(2026, 12, 10),
        performed_by_name="A. Lindberg",
        performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands",
        external_lab_accreditation="RvA L205",
        result=CalibrationResult.pass_,
        temperature_c=20.1,
        humidity_pct=48.5,
        pressure_hpa=1013.2,
        created_by=admin.id,
    )
    cal_tt22 = Calibration(
        asset_id=asset_map["MAR-00427"].id,
        calibration_date=date(2025, 5, 30),
        due_date=date(2026, 5, 30),
        performed_by_name="M. Schmidt",
        performed_by_user_id=tech.id,
        external_lab_name="PTB Germany",
        external_lab_accreditation="DAkkS D-K-15070-01-00",
        result=CalibrationResult.pass_,
        temperature_c=22.3,
        humidity_pct=51.0,
        created_by=admin.id,
    )
    db.add(cal_pt01)
    db.add(cal_tt22)
    db.flush()

    # Calibration coefficients
    db.add(CalibrationCoefficient(
        calibration_id=cal_pt01.id,
        coefficient_type=CoefficientType.linear,
        gain=1.00120000,
        offset_value=0.00500000,
        unit_input="mA",
        unit_output="bar",
        range_min=4.0,
        range_max=20.0,
        uncertainty=0.00010000,
        uncertainty_coverage_factor=2.0,
        notes="Linear correction applied to 4–20 mA output",
    ))
    db.add(CalibrationCoefficient(
        calibration_id=cal_tt22.id,
        coefficient_type=CoefficientType.linear,
        gain=0.99980000,
        offset_value=-0.00200000,
        unit_input="mA",
        unit_output="°C",
        range_min=4.0,
        range_max=20.0,
        uncertainty=0.05000000,
        uncertainty_coverage_factor=2.0,
        notes="Linear correction for thermocouple output",
    ))

    # Certificates
    db.add(Certificate(
        asset_id=asset_map["MAR-00421"].id,
        calibration_id=cal_pt01.id,
        certificate_number="CERT-2025-NMI-0421",
        issued_by="NMI Netherlands",
        accreditation_body="RvA",
        accreditation_number="L205",
        issued_at=date(2025, 12, 10),
        valid_until=date(2026, 12, 10),
        created_by=admin.id,
    ))
    db.add(Certificate(
        asset_id=asset_map["MAR-00427"].id,
        calibration_id=cal_tt22.id,
        certificate_number="CERT-2025-PTB-0427",
        issued_by="PTB Germany",
        accreditation_body="DAkkS",
        accreditation_number="D-K-15070-01-00",
        issued_at=date(2025, 5, 30),
        valid_until=date(2026, 5, 30),
        created_by=admin.id,
    ))

    # Audit logs
    audit_entries = [
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="certificate.uploaded",
             entity_type="asset", entity_id=asset_map["MAR-00421"].id,
             entity_asset_id="MAR-00421", created_at=now - timedelta(minutes=12)),
        dict(actor_id=tech.id, actor_email="tech@mar.local", action="calibration.recorded",
             entity_type="asset", entity_id=asset_map["MAR-00427"].id,
             entity_asset_id="MAR-00427", created_at=now - timedelta(hours=1)),
        dict(actor_id=None, actor_email="system", action="asset.flagged_expired",
             entity_type="asset", entity_id=asset_map["MAR-00424"].id,
             entity_asset_id="MAR-00424", created_at=now - timedelta(hours=3)),
        dict(actor_id=tech.id, actor_email="tech@mar.local", action="asset.created",
             entity_type="asset", entity_id=asset_map["MAR-00438"].id,
             entity_asset_id="MAR-00438", created_at=now - timedelta(days=1)),
        dict(actor_id=None, actor_email="api:ci-runner", action="asset.synced",
             entity_type="asset", entity_id=asset_map["MAR-00426"].id,
             entity_asset_id="MAR-00426", created_at=now - timedelta(days=1, hours=2)),
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="asset.retired",
             entity_type="asset", entity_id=asset_map["MAR-00399"].id,
             entity_asset_id="MAR-00399", created_at=now - timedelta(days=2)),
    ]
    for ae in audit_entries:
        db.add(AuditLog(**ae))

    # Monthly throughput
    throughput = [
        CalibrationThroughput(year=2025, month=11, completed_count=16, expired_count=1),
        CalibrationThroughput(year=2025, month=12, completed_count=20, expired_count=1),
        CalibrationThroughput(year=2026, month=1, completed_count=26, expired_count=2),
        CalibrationThroughput(year=2026, month=2, completed_count=31, expired_count=1),
        CalibrationThroughput(year=2026, month=3, completed_count=35, expired_count=2),
        CalibrationThroughput(year=2026, month=4, completed_count=38, expired_count=1),
    ]
    db.add_all(throughput)
    db.commit()
