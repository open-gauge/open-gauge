import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.security import hash_password
from ..models.asset import Asset, AssetType
from ..models.stored_file import StoredFile
from ..models.asset_location import AssetLocation
from ..models.audit_log import AuditLog
from ..models.calibration import Calibration
from ..models.calibration_method import Procedure
from ..models.daq import DAQ
from ..models.location import Location
from ..models.organization import Organization
from ..models.sensor import Sensor
from ..models.team import Team
from ..models.user import User, UserRole


def _seed_procedures(db: Session, creator_id: uuid.UUID) -> None:
    """Insert the four reference calibration procedures. Idempotent guard is on the caller."""
    procedures = [
        Procedure(
            proc_id="PROC-PT-001",
            physical_quantity="pressure",
            name="Pressure transmitter — 5-point linearity",
            description="Five-point ascending and descending calibration of an industrial pressure transmitter against a dead-weight tester or reference gauge.",
            version="3.2",
            difficulty="Intermediate",
            standard_ref="IEC 60770-1",
            author="A. Lindberg",
            duration_min=45,
            tags=["Pressure", "#5-point", "#linearity"],
            equipment=[
                {"name": "Dead-weight tester", "model": "Fluke P3100"},
                {"name": "Reference multimeter", "model": "Fluke 87V"},
                {"name": "Loop calibrator", "model": "Fluke 705"},
            ],
            materials=[
                {"name": "Hydraulic oil", "quantity": "500 ml"},
                {"name": "PTFE thread tape", "quantity": "1 roll"},
            ],
            environment=[
                {"parameter": "Ambient temperature", "value": "20 ± 2 °C"},
                {"parameter": "Supply voltage", "value": "24 VDC ± 0.5"},
            ],
            safety_notes=[
                "Maximum system pressure must not exceed rated range of the DUT.",
                "Depressurize system fully before disconnecting fittings.",
            ],
            steps=[
                {"title": "Connect DUT", "description": "Flush lines. Secure all fittings. Verify no leaks.", "duration_min": 5},
                {"title": "Zero check", "description": "Vent to atmosphere. Record zero output. Adjust if outside ±0.03% FS.", "duration_min": 5},
                {"title": "Ascending points 25–100% span", "description": "Apply 25%, 50%, 75%, and 100% span. Allow 2 min per point. Record output (mA).", "duration_min": 20},
                {"title": "Descending points 75–0% span", "description": "Step down through 75%, 50%, 25%, 0%. Record output.", "duration_min": 10},
                {"title": "Compute & sign", "description": "Calculate linearity and hysteresis errors. Sign calibration report.", "duration_min": 5},
            ],
            acceptance_criteria=[
                {"label": "Linearity error", "limit": "≤ 0.10% FS"},
                {"label": "Hysteresis", "limit": "≤ 0.05% FS"},
            ],
            created_by=creator_id,
        ),
        Procedure(
            proc_id="PROC-TT-002",
            physical_quantity="temperature",
            name="RTD PT100 — ice point + dry-block",
            description="Three-point temperature calibration: 0 °C ice bath plus two dry-block points at 100 °C and 200 °C. Validates PT100 conformance to class A.",
            version="2.1",
            difficulty="Basic",
            standard_ref="IEC 60751 · ITS-90",
            author="M. Schmidt",
            duration_min=75,
            tags=["Temperature", "#PT100", "#its-90", "#rtd"],
            equipment=[
                {"name": "Reference thermometer", "model": "Fluke 1524 + 5615 probe"},
                {"name": "Dry-block calibrator", "model": "Fluke 9144, 50–660 °C"},
                {"name": "Ice point cell", "model": "Crushed ice / DI water"},
            ],
            materials=[
                {"name": "Distilled water", "quantity": "500 ml"},
                {"name": "Crushed ice", "quantity": "1 L"},
                {"name": "Thermal paste", "quantity": "1 g"},
            ],
            environment=[
                {"parameter": "Ambient temperature", "value": "20 ± 5 °C"},
                {"parameter": "Draft-free location", "value": "required"},
            ],
            safety_notes=[
                "Dry-block surfaces exceed 200 °C — use insulated handling tools.",
                "Allow 20 min cool-down before removing probes.",
            ],
            steps=[
                {"title": "Build the ice point", "description": "Pack crushed ice in a Dewar, add distilled water until slushy. Stir before each reading.", "duration_min": 10},
                {"title": "Insert reference & DUT", "description": "Submerge both probes to 150 mm depth, separated by 20 mm. Wait 5 min.", "duration_min": 5},
                {"title": "Record 0 °C", "description": "Capture 5 readings at 10 s intervals. Mean must lie within ±0.05 °C of 0.", "duration_min": 5},
                {"title": "Dry-block 100 °C", "description": "Set dry-block to 100 °C. After 15 min stabilization, record paired reference and DUT readings.", "duration_min": 20},
                {"title": "Dry-block 200 °C", "description": "Ramp to 200 °C. Stabilize, then record.", "duration_min": 25},
                {"title": "Compute & sign", "description": "Compute R(0), α, residuals. Upload certificate.", "duration_min": 10},
            ],
            acceptance_criteria=[
                {"label": "0 °C deviation", "limit": "≤ ±0.15 °C (Class A)"},
                {"label": "100 °C deviation", "limit": "≤ ±0.35 °C"},
                {"label": "200 °C deviation", "limit": "≤ ±0.55 °C"},
            ],
            created_by=creator_id,
        ),
        Procedure(
            proc_id="PROC-RH-003",
            physical_quantity="humidity",
            name="Humidity sensor — saturated salt solution",
            description="Multi-point calibration of capacitive humidity sensors using three saturated salt solutions to generate reference RH conditions.",
            version="1.5",
            difficulty="Basic",
            standard_ref="ASTM E104",
            author="A. Lindberg",
            duration_min=1440,
            tags=["Humidity", "#rh", "#salt-solution"],
            equipment=[
                {"name": "Humidity reference chamber", "model": "Rotronic HC2-C05"},
                {"name": "Reference hygro-thermometer", "model": "Vaisala HMT310"},
                {"name": "Sealed containers", "model": "3× 1 L glass"},
            ],
            materials=[
                {"name": "Lithium chloride (LiCl)", "quantity": "200 g"},
                {"name": "Sodium chloride (NaCl)", "quantity": "200 g"},
                {"name": "Potassium chloride (KCl)", "quantity": "200 g"},
                {"name": "Distilled water", "quantity": "50 ml each"},
            ],
            environment=[
                {"parameter": "Ambient temperature", "value": "23 ± 1 °C"},
                {"parameter": "Temperature stability", "value": "± 0.5 °C/h"},
            ],
            safety_notes=[
                "LiCl is hygroscopic and irritating — wear gloves and lab coat.",
                "Ensure containers are sealed during equilibration to prevent cross-contamination.",
            ],
            steps=[
                {"title": "Prepare salt solutions", "description": "Prepare saturated solutions of LiCl (~11% RH), NaCl (~75% RH), and KCl (~85% RH). Stir until excess solid remains undissolved.", "duration_min": 30},
                {"title": "Seal DUT in chambers", "description": "Place DUT and reference probe in first chamber. Seal tightly.", "duration_min": 10},
                {"title": "Equilibrate (11% RH)", "description": "Allow 12 h minimum for equilibration at LiCl reference. Record readings.", "duration_min": 720},
                {"title": "Move to 75% RH chamber", "description": "Transfer probes to NaCl chamber. Allow 6 h. Record.", "duration_min": 360},
                {"title": "Move to 85% RH chamber", "description": "Transfer probes to KCl chamber. Allow 6 h. Record.", "duration_min": 360},
                {"title": "Compute & sign", "description": "Calculate offset and gain errors. Sign calibration report.", "duration_min": 30},
            ],
            acceptance_criteria=[
                {"label": "Error at 11% RH", "limit": "≤ ±2.0% RH"},
                {"label": "Error at 75% RH", "limit": "≤ ±1.5% RH"},
                {"label": "Error at 85% RH", "limit": "≤ ±1.5% RH"},
            ],
            created_by=creator_id,
        ),
        Procedure(
            proc_id="PROC-FT-004",
            physical_quantity="flow",
            name="Mag-flow meter — zero verification",
            description="Zero-flow verification for electromagnetic flowmeters installed in closed-loop pipelines. Confirms zero offset is within specification.",
            version="1.2",
            difficulty="Advanced",
            standard_ref="ISO 6817",
            author="M. Schmidt",
            duration_min=30,
            tags=["Flow", "#magflow", "#zero-verification"],
            equipment=[
                {"name": "Reference flow transmitter", "model": "Endress+Hauser Proline"},
                {"name": "Loop calibrator", "model": "Fluke 705"},
                {"name": "Valve lockout kit", "model": "Brady"},
            ],
            materials=[
                {"name": "Lockout/tagout labels", "quantity": "1 set"},
            ],
            environment=[
                {"parameter": "Flow condition", "value": "zero flow (isolation valves closed)"},
                {"parameter": "Pipe full", "value": "required (no air pockets)"},
            ],
            safety_notes=[
                "Ensure isolation valves are locked out per site LOTO procedure before entering flow path.",
                "Confirm process fluid is not hazardous before any connection.",
                "Pressurized pipes — never break connections without full depressurization.",
            ],
            steps=[
                {"title": "Isolate flow path", "description": "Close upstream and downstream isolation valves. Apply LOTO. Verify zero flow with sight glass or independent reference.", "duration_min": 10},
                {"title": "Record zero output", "description": "Monitor flow transmitter output for 5 min. Record mean and peak deviation.", "duration_min": 5},
                {"title": "Evaluate zero offset", "description": "Compare mean zero output to specification. Adjust zero trim if drift > 0.5% FS.", "duration_min": 5},
                {"title": "Restore flow", "description": "Remove LOTO. Open valves slowly. Confirm return to normal flow reading.", "duration_min": 5},
                {"title": "Document & sign", "description": "Record zero offset value and any adjustments made. Sign the verification record.", "duration_min": 5},
            ],
            acceptance_criteria=[
                {"label": "Zero offset", "limit": "≤ 0.5% FS"},
                {"label": "Zero drift (5 min)", "limit": "≤ 0.2% FS"},
            ],
            created_by=creator_id,
        ),
    ]
    for proc in procedures:
        db.add(proc)


def seed_database(db: Session) -> None:
    if db.query(Organization).count() > 0:
        # Org already seeded — procedures may have been added in a later migration cycle
        if db.query(Procedure).count() == 0:
            creator = db.query(User).filter(User.is_superuser == True).first()  # noqa: E712
            if creator:
                _seed_procedures(db, creator.id)
                db.commit()
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
        temperature=20.1, humidity=48.5, pressure=101320.0,
        created_by=admin.id,
    )
    cal_tt22 = Calibration(
        asset_id=asset_map["MAR-00427"].id,
        calibration_date=date(2025, 5, 30),
        due_date=date(2026, 5, 30),
        performed_by_name="M. Schmidt",
        performed_by_user_id=tech.id,
        external_lab_name="PTB Germany",
        temperature=22.3, humidity=51.0,
        created_by=admin.id,
    )
    cal_rps = Calibration(
        asset_id=asset_map["MAR-00504"].id,
        calibration_date=date(2025, 11, 5),
        due_date=date(2026, 11, 5),
        performed_by_name="A. Lindberg",
        performed_by_user_id=admin.id,
        external_lab_name="PTB Germany",
        temperature=20.0, humidity=50.0, pressure=101300.0,
        notes="WIKA reference standard annual calibration",
        created_by=admin.id,
    )
    # Historical calibration for MAR-00421 (previous annual cycle)
    cal_pt01_prev = Calibration(
        asset_id=asset_map["MAR-00421"].id,
        calibration_date=date(2024, 12, 10),
        due_date=date(2025, 12, 10),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands",
        temperature=20.0, humidity=48.0, pressure=101300.0,
        created_by=admin.id,
    )
    # MAR-00422 Coolant Loop TT-12 — annual, expired
    cal_tt12 = Calibration(
        asset_id=asset_map["MAR-00422"].id,
        calibration_date=date(2025, 3, 15),
        due_date=date(2026, 3, 15),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        temperature=22.0, humidity=50.0,
        created_by=admin.id,
    )
    # MAR-00423 Cleanroom RH-Sensor — annual, upcoming Sep 2026
    cal_rh01 = Calibration(
        asset_id=asset_map["MAR-00423"].id,
        calibration_date=date(2025, 9, 20),
        due_date=date(2026, 9, 20),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        temperature=20.5, humidity=45.0,
        created_by=admin.id,
    )
    # MAR-00424 Process Flow FT-08 — annual, expired Feb 2026
    cal_ft08 = Calibration(
        asset_id=asset_map["MAR-00424"].id,
        calibration_date=date(2025, 2, 28),
        due_date=date(2026, 2, 28),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        temperature=19.8, humidity=55.0,
        created_by=admin.id,
    )
    # MAR-00425 Boiler Output PT-04 — annual, upcoming Jul 2026
    cal_pt04 = Calibration(
        asset_id=asset_map["MAR-00425"].id,
        calibration_date=date(2025, 7, 20),
        due_date=date(2026, 7, 20),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        temperature=21.0, humidity=48.0,
        created_by=admin.id,
    )
    # MAR-00427 Furnace TT-22 — recalibration after expiry
    cal_tt22_new = Calibration(
        asset_id=asset_map["MAR-00427"].id,
        calibration_date=date(2026, 6, 15),
        due_date=date(2027, 6, 15),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany",
        temperature=23.5, humidity=52.0,
        notes="Recalibrated after expiry. Conditional pass — gain correction applied.",
        created_by=admin.id,
    )
    # MAR-00428 Cooling Tower RH-02 — annual, upcoming Nov 2026
    cal_rh02 = Calibration(
        asset_id=asset_map["MAR-00428"].id,
        calibration_date=date(2025, 11, 8),
        due_date=date(2026, 11, 8),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        temperature=20.0, humidity=50.0,
        created_by=admin.id,
    )
    # MAR-00429 Cooling Water FT-14 — annual, upcoming Feb 2027
    cal_ft14 = Calibration(
        asset_id=asset_map["MAR-00429"].id,
        calibration_date=date(2026, 2, 14),
        due_date=date(2027, 2, 14),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        temperature=20.0, humidity=48.0,
        created_by=admin.id,
    )
    # MAR-00432 Tank Bottom TT-19 — annual, expired Apr 2026, FAILED (low health)
    cal_tt19 = Calibration(
        asset_id=asset_map["MAR-00432"].id,
        calibration_date=date(2025, 4, 12),
        due_date=date(2026, 4, 12),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        notes="Out of tolerance at high range. Health flagged. Replacement requested.",
        temperature=21.5, humidity=51.0,
        created_by=admin.id,
    )
    # MAR-00438 Ambient TT-38 — 6-month schedule, first cycle
    cal_tt38_1 = Calibration(
        asset_id=asset_map["MAR-00438"].id,
        calibration_date=date(2025, 7, 22),
        due_date=date(2026, 1, 22),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany",
        temperature=20.0, humidity=50.0, pressure=101300.0,
        created_by=admin.id,
    )
    # MAR-00438 Ambient TT-38 — 6-month schedule, second cycle (performed on due date)
    cal_tt38_2 = Calibration(
        asset_id=asset_map["MAR-00438"].id,
        calibration_date=date(2026, 1, 22),
        due_date=date(2026, 7, 22),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany",
        temperature=20.1, humidity=49.8, pressure=101310.0,
        created_by=admin.id,
    )
    # MAR-00504 Reference Pressure Standard — historical 2024
    cal_rps_prev = Calibration(
        asset_id=asset_map["MAR-00504"].id,
        calibration_date=date(2024, 11, 5),
        due_date=date(2025, 11, 5),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="PTB Germany",
        temperature=20.0, humidity=50.0, pressure=101300.0,
        created_by=admin.id,
    )
    # MAR-00505 Reference Thermometer — 6-month, first cycle, expired Mar 2026
    cal_rtd_1 = Calibration(
        asset_id=asset_map["MAR-00505"].id,
        calibration_date=date(2025, 9, 10),
        due_date=date(2026, 3, 10),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands",
        temperature=20.0, humidity=50.0, pressure=101300.0,
        created_by=admin.id,
    )
    # MAR-00505 Reference Thermometer — 6-month, second cycle, upcoming Sep 2026
    cal_rtd_2 = Calibration(
        asset_id=asset_map["MAR-00505"].id,
        calibration_date=date(2026, 3, 12),
        due_date=date(2026, 9, 12),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="NMI Netherlands",
        temperature=20.1, humidity=50.2, pressure=101310.0,
        created_by=admin.id,
    )
    # MAR-00506 Field Data Logger FDL-04 — annual, expired Jun 2026
    cal_fdl04 = Calibration(
        asset_id=asset_map["MAR-00506"].id,
        calibration_date=date(2025, 6, 1),
        due_date=date(2026, 6, 1),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        temperature=21.0, humidity=52.0,
        created_by=admin.id,
    )
    # MAR-00507 NI USB-6341 — annual, upcoming Dec 2026
    cal_ni6341 = Calibration(
        asset_id=asset_map["MAR-00507"].id,
        calibration_date=date(2025, 12, 15),
        due_date=date(2026, 12, 15),
        performed_by_name="A. Lindberg", performed_by_user_id=admin.id,
        external_lab_name="Keysight Technologies",
        temperature=20.5, humidity=48.0,
        notes="Multifunction DAQ annual verification — all channels in spec.",
        created_by=admin.id,
    )
    # MAR-00426 Gateway CO-01 — annual, expired May 2026
    cal_gw01 = Calibration(
        asset_id=asset_map["MAR-00426"].id,
        calibration_date=date(2025, 5, 10),
        due_date=date(2026, 5, 10),
        performed_by_name="M. Schmidt", performed_by_user_id=tech.id,
        temperature=20.0, humidity=50.0,
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


    # ------------------------------------------------------------------ #
    # Stored files (seed — placeholder MinIO paths)                      #
    # ------------------------------------------------------------------ #
    stored_files = [
        StoredFile(
            original_filename="CERT-2025-NMI-0421.pdf",
            storage_path="assets/MAR-00421/CERT-2025-NMI-0421.pdf",
            bucket="mar-files",
            content_type="application/pdf",
            size_bytes=245_760,
            checksum_sha256="a3f1c2d4e5b6789012345678901234567890abcdef1234567890abcdef123456",
            entity_type="asset",
            entity_id=asset_map["MAR-00421"].id,
            uploaded_by=admin.id,
        ),
        StoredFile(
            original_filename="EH-Cerabar-PMP55-Datasheet.pdf",
            storage_path="assets/MAR-00421/EH-Cerabar-PMP55-Datasheet.pdf",
            bucket="mar-files",
            content_type="application/pdf",
            size_bytes=1_572_864,
            checksum_sha256="b4e2d3c5f6a7890123456789012345678901bcdef2345678901bcdef234567",
            entity_type="asset",
            entity_id=asset_map["MAR-00421"].id,
            uploaded_by=admin.id,
        ),
        StoredFile(
            original_filename="CERT-2025-PTB-0427.pdf",
            storage_path="assets/MAR-00427/CERT-2025-PTB-0427.pdf",
            bucket="mar-files",
            content_type="application/pdf",
            size_bytes=312_320,
            checksum_sha256="c5f3e4d6a7b8901234567890123456789012cdef3456789012cdef345678ab",
            entity_type="asset",
            entity_id=asset_map["MAR-00427"].id,
            uploaded_by=admin.id,
        ),
        StoredFile(
            original_filename="Calibration-Report-TT22-Jun2026.pdf",
            storage_path="assets/MAR-00427/Calibration-Report-TT22-Jun2026.pdf",
            bucket="mar-files",
            content_type="application/pdf",
            size_bytes=89_600,
            checksum_sha256="d6a4f5e7b8c9012345678901234567890123def4567890123def456789abcd",
            entity_type="asset",
            entity_id=asset_map["MAR-00427"].id,
            uploaded_by=tech.id,
        ),
        StoredFile(
            original_filename="Vaisala-HMP110-Datasheet.pdf",
            storage_path="assets/MAR-00423/Vaisala-HMP110-Datasheet.pdf",
            bucket="mar-files",
            content_type="application/pdf",
            size_bytes=819_200,
            checksum_sha256="e7b5a6f8c9d0123456789012345678901234ef567890123ef56789012abcde",
            entity_type="asset",
            entity_id=asset_map["MAR-00423"].id,
            uploaded_by=admin.id,
        ),
        StoredFile(
            original_filename="RH-Calibration-Raw-2025-09.csv",
            storage_path="assets/MAR-00423/RH-Calibration-Raw-2025-09.csv",
            bucket="mar-files",
            content_type="text/csv",
            size_bytes=14_336,
            checksum_sha256="f8c6b7a9d0e1234567890123456789012345f0678901234f067890123bcdef",
            entity_type="asset",
            entity_id=asset_map["MAR-00423"].id,
            uploaded_by=admin.id,
        ),
        StoredFile(
            original_filename="CERT-2025-PTB-0504.pdf",
            storage_path="assets/MAR-00504/CERT-2025-PTB-0504.pdf",
            bucket="mar-files",
            content_type="application/pdf",
            size_bytes=278_528,
            checksum_sha256="09d7c8b0e1f234567890123456789012345601789012345067890234cdef01",
            entity_type="asset",
            entity_id=asset_map["MAR-00504"].id,
            uploaded_by=admin.id,
        ),
    ]
    for sf in stored_files:
        db.add(sf)

    # ------------------------------------------------------------------ #
    # Audit logs                                                          #
    # ------------------------------------------------------------------ #
    audit_entries = [
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="asset.created",
             entity_type="asset", entity_id=asset_map["MAR-00421"].id,
             entity_asset_id="MAR-00421", created_at=now - timedelta(days=365)),
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="calibration.recorded",
             entity_type="asset", entity_id=asset_map["MAR-00421"].id,
             entity_asset_id="MAR-00421", created_at=now - timedelta(days=192)),
        dict(actor_id=admin.id, actor_email="admin@mar.local", action="calibration.recorded",
             entity_type="asset", entity_id=asset_map["MAR-00421"].id,
             entity_asset_id="MAR-00421", created_at=now - timedelta(minutes=30)),
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

    # ------------------------------------------------------------------ #
    # Calibration procedures                                              #
    # ------------------------------------------------------------------ #
    _seed_procedures(db, admin.id)

    db.commit()
