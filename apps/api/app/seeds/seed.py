import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.security import hash_password
from ..models.asset import Asset, AssetType
from ..models.asset_location import AssetLocation
from ..models.audit_log import AuditLog
from ..models.calibration import Calibration, CalibrationResult
from ..models.calibration_coefficient import CalibrationCoefficient, CoefficientType
from ..models.certificate import Certificate
from ..models.daq import DAQ
from ..models.location import Location
from ..models.organization import Organization
from ..models.sensor import Sensor
from ..models.team import Team
from ..models.user import User, UserRole


def seed_database(db: Session) -> None:
    if db.query(Organization).count() > 0:
        return

    now = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ #
    # Organization                                                        #
    # ------------------------------------------------------------------ #
    org = Organization(name="Demo Corp", description="MAR demonstration organization")
    db.add(org)
    db.flush()

    # ------------------------------------------------------------------ #
    # Users                                                               #
    # ------------------------------------------------------------------ #
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

    tech = User(
        email="tech@mar.local",
        name="M. Schmidt",
        hashed_password=hash_password("mar-tech-2026"),
        role=UserRole.technician,
        organization_id=org.id,
    )
    db.add(tech)
    db.flush()

    # ------------------------------------------------------------------ #
    # Teams                                                               #
    # ------------------------------------------------------------------ #
    team_instruments = Team(
        organization_id=org.id,
        name="Instrumentation",
        description="Responsible for all field sensors and transmitters",
        created_by=admin.id,
    )
    team_lab = Team(
        organization_id=org.id,
        name="Metrology Lab",
        description="Reference standards and calibration laboratory",
        created_by=admin.id,
    )
    db.add(team_instruments)
    db.add(team_lab)
    db.flush()

    # ------------------------------------------------------------------ #
    # Locations  (site → lab → bench hierarchy)                          #
    # ------------------------------------------------------------------ #
    plant = Location(
        organization_id=org.id,
        name="Main Plant",
        location_type="site",
        code="SITE-MAIN",
        address="Sector A, Industrial Park, Vienna",
        created_by=admin.id,
    )
    db.add(plant)
    db.flush()

    locs: dict[str, Location] = {}
    lab_defs = [
        ("Reactor Room",     "laboratory", "LAB-REACT",  plant.id),
        ("Loop 2",           "laboratory", "LAB-LOOP2",  plant.id),
        ("Cleanroom Bay 3",  "laboratory", "LAB-CR3",    plant.id),
        ("Pipeline Line 2",  "laboratory", "LAB-PIPE2",  plant.id),
        ("Boiler Unit 4",    "laboratory", "LAB-BOIL4",  plant.id),
        ("Control Room",     "room",       "RM-CTRL",    plant.id),
        ("Furnace Hall",     "laboratory", "LAB-FURN",   plant.id),
        ("Cooling Tower B",  "laboratory", "LAB-COOL",   plant.id),
        ("Tank Farm",        "laboratory", "LAB-TANK",   plant.id),
        ("Ambient Bay",      "room",       "RM-AMB",     plant.id),
        ("Old Vent Stack",   "field",      "FLD-VENT",   plant.id),
        ("Metrology Lab",    "laboratory", "LAB-METRO",  plant.id),
    ]
    for name, loc_type, code, parent_id in lab_defs:
        loc = Location(
            organization_id=org.id,
            parent_location_id=parent_id,
            name=name,
            location_type=loc_type,
            code=code,
            created_by=admin.id,
        )
        db.add(loc)
        db.flush()
        locs[name] = loc

    # ------------------------------------------------------------------ #
    # Assets — sensors                                                    #
    # ------------------------------------------------------------------ #
    def make_sensor(
        asset_id: str,
        name: str,
        manufacturer: str,
        model: str,
        location_name: str,
        health_score: int,
        channels: list[dict],
        owner_id: uuid.UUID | None = None,
        **kwargs,
    ) -> Asset:
        loc = locs[location_name]
        asset = Asset(
            asset_id=asset_id,
            asset_type=AssetType.sensor,
            name=name,
            manufacturer=manufacturer,
            model=model,
            location_id=loc.id,
            owner=owner_id if owner_id is not None else team_instruments.id,
            health_score=health_score,
            created_by=admin.id,
            **kwargs,
        )
        db.add(asset)
        db.flush()
        db.add(AssetLocation(asset_id=asset.id, location_id=loc.id, moved_by=admin.id, reason="Initial placement"))
        for ch in channels:
            db.add(Sensor(asset_id=asset.id, **ch))
        return asset

    def make_daq(
        asset_id: str,
        name: str,
        manufacturer: str,
        model: str,
        location_name: str,
        health_score: int,
        daq_kwargs: dict,
        owner_id: uuid.UUID | None = None,
        **kwargs,
    ) -> Asset:
        loc = locs[location_name]
        asset = Asset(
            asset_id=asset_id,
            asset_type=AssetType.daq,
            name=name,
            manufacturer=manufacturer,
            model=model,
            location_id=loc.id,
            owner=owner_id if owner_id is not None else team_instruments.id,
            health_score=health_score,
            created_by=admin.id,
            **kwargs,
        )
        db.add(asset)
        db.flush()
        db.add(AssetLocation(asset_id=asset.id, location_id=loc.id, moved_by=admin.id, reason="Initial placement"))
        db.add(DAQ(asset_id=asset.id, **daq_kwargs))
        return asset

    asset_map: dict[str, Asset] = {}

    # --- Pressure sensors ---
    a = make_sensor(
        "MAR-00421", "Reactor Inlet PT-01", "Endress+Hauser", "Cerabar PMP55",
        "Reactor Room", 95,
        channels=[dict(
            channel_id="Pressure",
            physical_quantity="pressure", unit="bar",
            technology="piezoresistive",
            measurement_min=0.0, measurement_max=25.0,
            accuracy_value=0.075, accuracy_type="percent_of_span",
            output_signal_min=4.0, output_signal_max=20.0, output_signal_unit="mA",
            output_type="analog",
            calibration_role="working", criticality="critical",
        )],
        serial_number="EH-PT-00421", ip_rating="IP67",
        operating_temperature_min=-40.0, operating_temperature_max=85.0,
        power_supply="24 VDC", power_consumption_w=1,
    )
    asset_map["MAR-00421"] = a

    a = make_sensor(
        "MAR-00425", "Boiler Output PT-04", "WIKA", "S-20",
        "Boiler Unit 4", 92,
        channels=[dict(
            channel_id="Pressure",
            physical_quantity="pressure", unit="bar",
            measurement_min=0.0, measurement_max=25.0,
            accuracy_value=0.5, accuracy_type="percent_of_span",
            output_signal_min=4.0, output_signal_max=20.0, output_signal_unit="mA",
            output_type="analog", criticality="critical",
        )],
        serial_number="WIKA-PT-00425", ip_rating="IP65",
        operating_temperature_min=-20.0, operating_temperature_max=80.0,
        power_supply="24 VDC",
    )
    asset_map["MAR-00425"] = a

    # --- Temperature sensors ---
    a = make_sensor(
        "MAR-00422", "Coolant Loop TT-12", "Omega", "PR-21SL-3-100-A",
        "Loop 2", 82,
        channels=[dict(
            channel_id="Temperature",
            physical_quantity="temperature", unit="°C",
            technology="RTD Pt100",
            measurement_min=-50.0, measurement_max=150.0,
            accuracy_value=0.1, accuracy_type="absolute", accuracy_unit="°C",
            output_signal_min=4.0, output_signal_max=20.0, output_signal_unit="mA",
            output_type="analog",
            calibration_role="working", criticality="non-critical",
        )],
        serial_number="OM-TT-00422",
        operating_temperature_min=-20.0, operating_temperature_max=80.0,
    )
    asset_map["MAR-00422"] = a

    a = make_sensor(
        "MAR-00427", "Furnace TT-22", "Yokogawa", "EJX910A",
        "Furnace Hall", 76,
        channels=[dict(
            channel_id="Temperature",
            physical_quantity="temperature", unit="°C",
            technology="thermocouple type K",
            measurement_min=-20.0, measurement_max=600.0,
            accuracy_value=0.25, accuracy_type="percent_of_span",
            output_signal_min=4.0, output_signal_max=20.0, output_signal_unit="mA",
            output_type="analog",
            calibration_role="working", criticality="critical",
        )],
        serial_number="YK-TT-00427",
        operating_temperature_min=-40.0, operating_temperature_max=85.0,
        power_supply="24 VDC", power_consumption_w=2,
    )
    asset_map["MAR-00427"] = a

    a = make_sensor(
        "MAR-00432", "Tank Bottom TT-19", "WIKA", "TR10-B",
        "Tank Farm", 38,
        channels=[dict(
            channel_id="Temperature",
            physical_quantity="temperature", unit="°C",
            technology="RTD Pt100",
            measurement_min=-50.0, measurement_max=200.0,
            accuracy_value=0.3, accuracy_type="absolute", accuracy_unit="°C",
            output_type="analog", criticality="non-critical",
        )],
        serial_number="WIKA-TT-00432",
    )
    asset_map["MAR-00432"] = a

    a = make_sensor(
        "MAR-00438", "Ambient TT-38", "Fluke", "1502A",
        "Ambient Bay", 100,
        channels=[dict(
            channel_id="Temperature",
            physical_quantity="temperature", unit="°C",
            technology="RTD Pt100",
            measurement_min=-200.0, measurement_max=660.0,
            accuracy_value=0.005, accuracy_type="absolute", accuracy_unit="°C",
            resolution=0.001, resolution_unit="°C",
            calibration_role="reference", criticality="critical",
        )],
        serial_number="FL-TT-00438",
        owner_id=team_lab.id,
    )
    asset_map["MAR-00438"] = a

    # --- Humidity sensors ---
    a = make_sensor(
        "MAR-00423", "Cleanroom RH-Sensor", "Vaisala", "HMP110",
        "Cleanroom Bay 3", 88,
        channels=[
            dict(
                channel_id="Humidity",
                physical_quantity="humidity", unit="%RH",
                technology="capacitive",
                measurement_min=0.0, measurement_max=100.0,
                accuracy_value=1.5, accuracy_type="absolute", accuracy_unit="%RH",
                output_signal_min=0.0, output_signal_max=1.0, output_signal_unit="V",
                output_type="analog", criticality="non-critical",
            ),
            dict(
                channel_id="Temperature",
                physical_quantity="temperature", unit="°C",
                technology="RTD",
                measurement_min=-40.0, measurement_max=80.0,
                accuracy_value=0.2, accuracy_type="absolute", accuracy_unit="°C",
                output_type="analog", criticality="non-critical",
            ),
        ],
        serial_number="VA-RH-00423", ip_rating="IP65",
    )
    asset_map["MAR-00423"] = a

    a = make_sensor(
        "MAR-00428", "Cooling Tower RH-02", "Rotronic", "HC2A",
        "Cooling Tower B", 89,
        channels=[dict(
            channel_id="Humidity",
            physical_quantity="humidity", unit="%RH",
            technology="capacitive ROTRONIC-Hygromer",
            measurement_min=0.0, measurement_max=100.0,
            accuracy_value=0.8, accuracy_type="absolute", accuracy_unit="%RH",
            criticality="non-critical",
        )],
        serial_number="RT-RH-00428",
    )
    asset_map["MAR-00428"] = a

    # --- Flow sensors ---
    a = make_sensor(
        "MAR-00424", "Process Flow FT-08", "Siemens", "SITRANS F M MAG 5100",
        "Pipeline Line 2", 41,
        channels=[dict(
            channel_id="Flow",
            physical_quantity="flow", unit="m³/h",
            technology="electromagnetic",
            measurement_min=0.0, measurement_max=500.0,
            accuracy_value=0.5, accuracy_type="percent_of_reading",
            output_signal_min=4.0, output_signal_max=20.0, output_signal_unit="mA",
            output_type="analog",
            calibration_role="working", criticality="critical",
        )],
        serial_number="SI-FT-00424", ip_rating="IP68",
        operating_temperature_min=-20.0, operating_temperature_max=70.0,
        power_supply="24 VDC", power_consumption_w=10,
    )
    asset_map["MAR-00424"] = a

    a = make_sensor(
        "MAR-00429", "Cooling Water FT-14", "Endress+Hauser", "Promag 50W",
        "Cooling Tower B", 91,
        channels=[dict(
            channel_id="Flow",
            physical_quantity="flow", unit="m³/h",
            technology="electromagnetic",
            measurement_min=0.0, measurement_max=300.0,
            accuracy_value=0.5, accuracy_type="percent_of_reading",
            output_signal_min=4.0, output_signal_max=20.0, output_signal_unit="mA",
            output_type="analog", criticality="non-critical",
        )],
        serial_number="EH-FT-00429", ip_rating="IP67",
    )
    asset_map["MAR-00429"] = a

    # --- Reference standard sensor ---
    a = make_sensor(
        "MAR-00504", "Reference Pressure Standard RPS-01", "WIKA", "CPH7600",
        "Metrology Lab", 99,
        channels=[dict(
            channel_id="Pressure",
            physical_quantity="pressure", unit="bar",
            measurement_min=0.0, measurement_max=10.0,
            accuracy_value=0.025, accuracy_type="percent_of_span",
            measurement_uncertainty=0.001, uncertainty_unit="bar",
            confidence_level=95.0, coverage_factor=2.0,
            calibration_role="reference", criticality="critical",
        )],
        serial_number="WIKA-RPS-00504",
        owner_id=team_lab.id,
    )
    asset_map["MAR-00504"] = a

    a = make_sensor(
        "MAR-00505", "Reference Thermometer RTD-01", "Fluke", "1524",
        "Metrology Lab", 98,
        channels=[dict(
            channel_id="Temperature",
            physical_quantity="temperature", unit="°C",
            technology="RTD Pt100",
            measurement_min=-200.0, measurement_max=420.0,
            accuracy_value=0.002, accuracy_type="absolute", accuracy_unit="°C",
            measurement_uncertainty=0.01, uncertainty_unit="°C",
            confidence_level=95.0, coverage_factor=2.0,
            calibration_role="reference", criticality="critical",
        )],
        serial_number="FL-RTD-00505",
        owner_id=team_lab.id,
    )
    asset_map["MAR-00505"] = a

    # --- Retired sensor ---
    retired_loc = locs["Old Vent Stack"]
    retired = Asset(
        asset_id="MAR-00399",
        asset_type=AssetType.sensor,
        name="Exhaust Vent TT-99",
        manufacturer="Honeywell",
        model="STT25H",
        location_id=retired_loc.id,
        owner=team_instruments.id,
        health_score=60,
        is_active=False,
        retired_at=now - timedelta(days=2),
        retired_by=admin.id,
        retired_reason="Decommissioned — replaced with MAR-00422",
        created_by=admin.id,
    )
    db.add(retired)
    db.flush()
    db.add(AssetLocation(asset_id=retired.id, location_id=retired_loc.id, moved_by=admin.id, reason="Initial placement"))
    db.add(Sensor(
        asset_id=retired.id,
        channel_id="Temperature",
        physical_quantity="temperature", unit="°C",
        measurement_min=-40.0, measurement_max=150.0,
        calibration_role="working",
    ))
    asset_map["MAR-00399"] = retired

    # ------------------------------------------------------------------ #
    # Assets — DAQ systems                                                #
    # ------------------------------------------------------------------ #
    a = make_daq(
        "MAR-00426", "Gateway CO-01", "ABB", "Wireless HART Bridge",
        "Control Room", 79,
        daq_kwargs=dict(
            daq_type="Wireless",
            input_channels=8,
            output_channels=0,
            input_signal_types="HART, 4-20mA",
            communication_protocol="HART",
            interface_type="Wireless 802.11",
            synchronization_supported=False,
        ),
        serial_number="ABB-GW-00426",
        power_supply="24 VDC", power_consumption_w=5,
        ip_rating="IP65",
    )
    asset_map["MAR-00426"] = a

    a = make_daq(
        "MAR-00506", "Field Data Logger FDL-04", "Honeywell", "DL06",
        "Tank Farm", 85,
        daq_kwargs=dict(
            daq_type="USB",
            input_channels=16,
            output_channels=0,
            input_signal_types="4-20mA, 0-10V, Thermocouple",
            sampling_rate_hz=1.0,
            communication_protocol="Modbus RTU",
            interface_type="USB",
            adc_resolution_bits=16,
            synchronization_supported=False,
        ),
        serial_number="HW-DL-00506",
        power_supply="5 VDC USB",
    )
    asset_map["MAR-00506"] = a

    a = make_daq(
        "MAR-00507", "NI USB-6341 Multifunction DAQ", "National Instruments", "USB-6341",
        "Metrology Lab", 97,
        daq_kwargs=dict(
            daq_type="USB",
            input_channels=16,
            output_channels=2,
            input_signal_types="Differential, Single-ended",
            output_signal_types="Analog, Digital",
            sampling_rate_hz=500000.0,
            per_channel_sampling_rate_hz=31250.0,
            adc_resolution_bits=16,
            adc_type="successive_approximation",
            input_voltage_range_min=-10.0,
            input_voltage_range_max=10.0,
            noise_floor_uv_rms=3.5,
            dynamic_range_db=95.0,
            synchronization_supported=True,
            clock_source="internal",
            time_sync_precision_ns=50.0,
            communication_protocol="USB",
            interface_type="USB",
        ),
        serial_number="NI-USB6341-507",
        owner_id=team_lab.id,
    )
    asset_map["MAR-00507"] = a

    db.flush()

    # ------------------------------------------------------------------ #
    # Calibrations                                                        #
    # ------------------------------------------------------------------ #
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
    cal_rps = Calibration(
        asset_id=asset_map["MAR-00504"].id,
        calibration_date=date(2025, 11, 5),
        due_date=date(2026, 11, 5),
        performed_by_name="A. Lindberg",
        performed_by_user_id=admin.id,
        external_lab_name="PTB Germany",
        external_lab_accreditation="DAkkS D-K-15070-01-00",
        result=CalibrationResult.pass_,
        temperature_c=20.0,
        humidity_pct=50.0,
        pressure_hpa=1013.0,
        notes="WIKA reference standard annual calibration",
        created_by=admin.id,
    )
    # Historical calibration for MAR-00421 (previous annual cycle)
    cal_pt01_prev = Calibration(
        asset_id=asset_map["MAR-00421"].id,
        calibration_date=date(2024, 12, 10),
        due_date=date(2025, 12, 10),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands", external_lab_accreditation="RvA L205",
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=48.0, pressure_hpa=1013.0,
        created_by=admin.id,
    )
    # MAR-00422 Coolant Loop TT-12 — annual, expired
    cal_tt12 = Calibration(
        asset_id=asset_map["MAR-00422"].id,
        calibration_date=date(2025, 3, 15),
        due_date=date(2026, 3, 15),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        result=CalibrationResult.pass_,
        temperature_c=22.0, humidity_pct=50.0,
        created_by=admin.id,
    )
    # MAR-00423 Cleanroom RH-Sensor — annual, upcoming Sep 2026
    cal_rh01 = Calibration(
        asset_id=asset_map["MAR-00423"].id,
        calibration_date=date(2025, 9, 20),
        due_date=date(2026, 9, 20),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        result=CalibrationResult.pass_,
        temperature_c=20.5, humidity_pct=45.0,
        created_by=admin.id,
    )
    # MAR-00424 Process Flow FT-08 — annual, expired Feb 2026
    cal_ft08 = Calibration(
        asset_id=asset_map["MAR-00424"].id,
        calibration_date=date(2025, 2, 28),
        due_date=date(2026, 2, 28),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        result=CalibrationResult.pass_,
        temperature_c=19.8, humidity_pct=55.0,
        created_by=admin.id,
    )
    # MAR-00425 Boiler Output PT-04 — annual, upcoming Jul 2026
    cal_pt04 = Calibration(
        asset_id=asset_map["MAR-00425"].id,
        calibration_date=date(2025, 7, 20),
        due_date=date(2026, 7, 20),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        result=CalibrationResult.pass_,
        temperature_c=21.0, humidity_pct=48.0,
        created_by=admin.id,
    )
    # MAR-00427 Furnace TT-22 — recalibration after expiry
    cal_tt22_new = Calibration(
        asset_id=asset_map["MAR-00427"].id,
        calibration_date=date(2026, 6, 15),
        due_date=date(2027, 6, 15),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany", external_lab_accreditation="DAkkS D-K-15070-01-00",
        result=CalibrationResult.conditional_pass,
        temperature_c=23.5, humidity_pct=52.0,
        notes="Recalibrated after expiry. Conditional pass — gain correction applied.",
        created_by=admin.id,
    )
    # MAR-00428 Cooling Tower RH-02 — annual, upcoming Nov 2026
    cal_rh02 = Calibration(
        asset_id=asset_map["MAR-00428"].id,
        calibration_date=date(2025, 11, 8),
        due_date=date(2026, 11, 8),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=50.0,
        created_by=admin.id,
    )
    # MAR-00429 Cooling Water FT-14 — annual, upcoming Feb 2027
    cal_ft14 = Calibration(
        asset_id=asset_map["MAR-00429"].id,
        calibration_date=date(2026, 2, 14),
        due_date=date(2027, 2, 14),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=48.0,
        created_by=admin.id,
    )
    # MAR-00432 Tank Bottom TT-19 — annual, expired Apr 2026, FAILED (low health)
    cal_tt19 = Calibration(
        asset_id=asset_map["MAR-00432"].id,
        calibration_date=date(2025, 4, 12),
        due_date=date(2026, 4, 12),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        result=CalibrationResult.fail,
        notes="Out of tolerance at high range. Health flagged. Replacement requested.",
        temperature_c=21.5, humidity_pct=51.0,
        created_by=admin.id,
    )
    # MAR-00438 Ambient TT-38 — 6-month schedule, first cycle
    cal_tt38_1 = Calibration(
        asset_id=asset_map["MAR-00438"].id,
        calibration_date=date(2025, 7, 22),
        due_date=date(2026, 1, 22),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany", external_lab_accreditation="DAkkS D-K-15070-01-00",
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=50.0, pressure_hpa=1013.0,
        created_by=admin.id,
    )
    # MAR-00438 Ambient TT-38 — 6-month schedule, second cycle (performed on due date)
    cal_tt38_2 = Calibration(
        asset_id=asset_map["MAR-00438"].id,
        calibration_date=date(2026, 1, 22),
        due_date=date(2026, 7, 22),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany", external_lab_accreditation="DAkkS D-K-15070-01-00",
        result=CalibrationResult.pass_,
        temperature_c=20.1, humidity_pct=49.8, pressure_hpa=1013.1,
        created_by=admin.id,
    )
    # MAR-00504 Reference Pressure Standard — historical 2024
    cal_rps_prev = Calibration(
        asset_id=asset_map["MAR-00504"].id,
        calibration_date=date(2024, 11, 5),
        due_date=date(2025, 11, 5),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany", external_lab_accreditation="DAkkS D-K-15070-01-00",
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=50.0, pressure_hpa=1013.0,
        created_by=admin.id,
    )
    # MAR-00505 Reference Thermometer — 6-month, first cycle, expired Mar 2026
    cal_rtd_1 = Calibration(
        asset_id=asset_map["MAR-00505"].id,
        calibration_date=date(2025, 9, 10),
        due_date=date(2026, 3, 10),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands", external_lab_accreditation="RvA L205",
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=50.0, pressure_hpa=1013.0,
        created_by=admin.id,
    )
    # MAR-00505 Reference Thermometer — 6-month, second cycle, upcoming Sep 2026
    cal_rtd_2 = Calibration(
        asset_id=asset_map["MAR-00505"].id,
        calibration_date=date(2026, 3, 12),
        due_date=date(2026, 9, 12),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands", external_lab_accreditation="RvA L205",
        result=CalibrationResult.pass_,
        temperature_c=20.1, humidity_pct=50.2, pressure_hpa=1013.1,
        created_by=admin.id,
    )
    # MAR-00506 Field Data Logger FDL-04 — annual, expired Jun 2026
    cal_fdl04 = Calibration(
        asset_id=asset_map["MAR-00506"].id,
        calibration_date=date(2025, 6, 1),
        due_date=date(2026, 6, 1),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        result=CalibrationResult.pass_,
        temperature_c=21.0, humidity_pct=52.0,
        created_by=admin.id,
    )
    # MAR-00507 NI USB-6341 — annual, upcoming Dec 2026
    cal_ni6341 = Calibration(
        asset_id=asset_map["MAR-00507"].id,
        calibration_date=date(2025, 12, 15),
        due_date=date(2026, 12, 15),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="Keysight Technologies",
        result=CalibrationResult.pass_,
        temperature_c=20.5, humidity_pct=48.0,
        notes="Multifunction DAQ annual verification — all channels in spec.",
        created_by=admin.id,
    )
    # MAR-00426 Gateway CO-01 — annual, expired May 2026
    cal_gw01 = Calibration(
        asset_id=asset_map["MAR-00426"].id,
        calibration_date=date(2025, 5, 10),
        due_date=date(2026, 5, 10),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        result=CalibrationResult.pass_,
        temperature_c=20.0, humidity_pct=50.0,
        created_by=admin.id,
    )

    for cal in [
        cal_pt01, cal_tt22, cal_rps,
        cal_pt01_prev, cal_tt12, cal_rh01, cal_ft08, cal_pt04,
        cal_tt22_new, cal_rh02, cal_ft14, cal_tt19,
        cal_tt38_1, cal_tt38_2, cal_rps_prev,
        cal_rtd_1, cal_rtd_2, cal_fdl04, cal_ni6341, cal_gw01,
    ]:
        db.add(cal)
    db.flush()

    # Calibration coefficients
    db.add(CalibrationCoefficient(
        calibration_id=cal_pt01.id,
        channel="Pressure",
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
        channel="Temperature",
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
    db.add(CalibrationCoefficient(
        calibration_id=cal_rps.id,
        channel="Pressure",
        coefficient_type=CoefficientType.linear,
        gain=1.00005000,
        offset_value=0.00001000,
        unit_input="mA",
        unit_output="bar",
        range_min=0.0,
        range_max=10.0,
        uncertainty=0.000005,
        uncertainty_coverage_factor=2.0,
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
    db.add(Certificate(
        asset_id=asset_map["MAR-00504"].id,
        calibration_id=cal_rps.id,
        certificate_number="CERT-2025-PTB-0504",
        issued_by="PTB Germany",
        accreditation_body="DAkkS",
        accreditation_number="D-K-15070-01-00",
        issued_at=date(2025, 11, 5),
        valid_until=date(2026, 11, 5),
        created_by=admin.id,
    ))

    # ------------------------------------------------------------------ #
    # Audit logs                                                          #
    # ------------------------------------------------------------------ #
    audit_entries = [
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="certificate.uploaded",
             entity_type="asset", entity_id=asset_map["MAR-00421"].id,
             entity_asset_id="MAR-00421", created_at=now - timedelta(minutes=12)),
        dict(actor_id=tech.id, actor_email="tech@mar.local", action="calibration.recorded",
             entity_type="asset", entity_id=asset_map["MAR-00427"].id,
             entity_asset_id="MAR-00427", created_at=now - timedelta(hours=1)),
        dict(actor_id=None, actor_email="system", action="asset.flagged_low_health",
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
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="calibration.recorded",
             entity_type="asset", entity_id=asset_map["MAR-00504"].id,
             entity_asset_id="MAR-00504", created_at=now - timedelta(days=5)),
        dict(actor_id=tech.id, actor_email="tech@mar.local", action="asset.moved",
             entity_type="asset", entity_id=asset_map["MAR-00507"].id,
             entity_asset_id="MAR-00507", created_at=now - timedelta(days=7)),
    ]
    for ae in audit_entries:
        db.add(AuditLog(**ae))

    db.commit()
