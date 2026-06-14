"""Restructure assets and locations

Removes: sites, laboratories, instruments, data_acquisition, calibration_throughput
Adds: teams, locations (hierarchical), asset_locations, daq
Rewrites: assets (new columns, asset_type enum), sensors (multi-channel, metrological fields)
Keeps intact: organizations, users, files, calibrations, certificates,
              calibration_coefficients, audit_logs

Revision ID: 002
Revises: 001
Create Date: 2026-06-18
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Drop tables that depend on assets first (FK order)               #
    # ------------------------------------------------------------------ #
    op.execute("DROP TABLE IF EXISTS calibration_throughput CASCADE")
    op.execute("DROP TABLE IF EXISTS calibration_coefficients CASCADE")
    op.execute("DROP TABLE IF EXISTS certificates CASCADE")
    op.execute("DROP TABLE IF EXISTS calibrations CASCADE")

    # ------------------------------------------------------------------ #
    # 2. Drop old asset subtypes and assets                               #
    # ------------------------------------------------------------------ #
    op.execute("DROP TABLE IF EXISTS sensors CASCADE")
    op.execute("DROP TABLE IF EXISTS instruments CASCADE")
    op.execute("DROP TABLE IF EXISTS data_acquisition CASCADE")
    op.execute("DROP TABLE IF EXISTS assets CASCADE")

    # ------------------------------------------------------------------ #
    # 3. Drop old location tables                                         #
    # ------------------------------------------------------------------ #
    op.execute("DROP TABLE IF EXISTS laboratories CASCADE")
    op.execute("DROP TABLE IF EXISTS sites CASCADE")

    # ------------------------------------------------------------------ #
    # 4. Drop stale enum types                                            #
    # ------------------------------------------------------------------ #
    op.execute("DROP TYPE IF EXISTS asset_category_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS sensor_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS instrument_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS daq_type_enum CASCADE")

    # ------------------------------------------------------------------ #
    # 5. New enum                                                         #
    # ------------------------------------------------------------------ #
    op.execute("CREATE TYPE asset_type_enum AS ENUM ('sensor', 'daq')")

    # ------------------------------------------------------------------ #
    # 6. teams                                                            #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE teams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_teams_organization_id ON teams(organization_id)")

    # ------------------------------------------------------------------ #
    # 7. locations  (self-referencing hierarchy)                          #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE locations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            parent_location_id UUID REFERENCES locations(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            location_type VARCHAR(255) NOT NULL,
            code VARCHAR(50),
            address TEXT,
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            is_active BOOLEAN NOT NULL DEFAULT true,
            archived_at TIMESTAMPTZ,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_locations_org_code UNIQUE (organization_id, code)
        )
    """)
    op.execute("CREATE INDEX ix_locations_organization_id ON locations(organization_id)")
    op.execute("CREATE INDEX ix_locations_parent_location_id ON locations(parent_location_id)")

    # ------------------------------------------------------------------ #
    # 8. assets (new structure)                                           #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id VARCHAR(20) NOT NULL UNIQUE,
            asset_type asset_type_enum NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            manufacturer VARCHAR(255) NOT NULL,
            model VARCHAR(255) NOT NULL,
            serial_number VARCHAR(255),
            manufacturer_part_number VARCHAR(255),
            location_id UUID REFERENCES locations(id),
            owner UUID REFERENCES teams(id),
            datasheet_file_id UUID REFERENCES files(id),
            datasheet_url TEXT,
            firmware_version VARCHAR(100),
            power_supply VARCHAR(100),
            power_consumption_w INTEGER,
            dimensions VARCHAR(100),
            weight_kg DECIMAL(10, 3),
            mounting_type VARCHAR(100),
            connection_type VARCHAR(100),
            displays_readings BOOLEAN NOT NULL DEFAULT false,
            ip_rating VARCHAR(20),
            hazardous_area_rating VARCHAR(100),
            operating_temperature_min DECIMAL(18, 8),
            operating_temperature_max DECIMAL(18, 8),
            operating_humidity_min DECIMAL(5, 2),
            operating_humidity_max DECIMAL(5, 2),
            health_score INTEGER NOT NULL DEFAULT 100,
            price_eur DECIMAL(12, 2),
            purchase_date DATE,
            warranty_expiry_date DATE,
            is_active BOOLEAN NOT NULL DEFAULT true,
            retired_at TIMESTAMPTZ,
            retired_by UUID REFERENCES users(id),
            retired_reason TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            notes TEXT
        )
    """)
    op.execute("CREATE INDEX ix_assets_asset_id ON assets(asset_id)")
    op.execute("CREATE INDEX ix_assets_location_id ON assets(location_id)")

    # ------------------------------------------------------------------ #
    # 9. sensors (multi-channel, metrological fields)                     #
    # W1 fix: UNIQUE(asset_id, channel_id) instead of UNIQUE(asset_id)   #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE sensors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(id),
            channel_id VARCHAR(255) NOT NULL,
            physical_quantity VARCHAR(255) NOT NULL,
            unit VARCHAR(50) NOT NULL,
            technology VARCHAR(255),
            measurement_min DECIMAL(18, 8),
            measurement_max DECIMAL(18, 8),
            accuracy_value DECIMAL(18, 8),
            accuracy_type VARCHAR(255),
            accuracy_unit VARCHAR(50),
            resolution DECIMAL(18, 8),
            resolution_unit VARCHAR(50),
            measurement_uncertainty DECIMAL(18, 8),
            uncertainty_unit VARCHAR(50),
            confidence_level DECIMAL(5, 2),
            coverage_factor DECIMAL(5, 2),
            drift_rate DECIMAL(18, 8),
            drift_unit VARCHAR(50),
            sensitivity DECIMAL(18, 8),
            sensitivity_unit VARCHAR(100),
            response_time_ms DECIMAL(18, 8),
            bandwidth_hz DECIMAL(18, 8),
            output_signal_min DECIMAL(18, 8),
            output_signal_max DECIMAL(18, 8),
            output_signal_unit VARCHAR(50),
            output_type VARCHAR(255),
            calibration_role VARCHAR(255),
            criticality VARCHAR(255),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_sensors_asset_channel UNIQUE (asset_id, channel_id)
        )
    """)
    op.execute("CREATE INDEX ix_sensors_asset_id ON sensors(asset_id)")

    # ------------------------------------------------------------------ #
    # 10. daq  (W5 fix: includes is_active)                               #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE daq (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL UNIQUE REFERENCES assets(id),
            daq_type VARCHAR(255) NOT NULL,
            input_channels INTEGER NOT NULL,
            output_channels INTEGER NOT NULL,
            input_signal_types VARCHAR(255),
            output_signal_types VARCHAR(255),
            sampling_rate_hz DECIMAL(12, 4),
            per_channel_sampling_rate_hz DECIMAL(12, 4),
            adc_resolution_bits INTEGER,
            adc_type VARCHAR(255),
            input_voltage_range_min DECIMAL(18, 8),
            input_voltage_range_max DECIMAL(18, 8),
            input_impedance_ohm DECIMAL(18, 2),
            noise_floor_uv_rms DECIMAL(18, 8),
            dynamic_range_db DECIMAL(10, 4),
            synchronization_supported BOOLEAN NOT NULL DEFAULT false,
            clock_source VARCHAR(255),
            time_sync_precision_ns DECIMAL(18, 4),
            jitter_ns DECIMAL(18, 4),
            communication_protocol VARCHAR(100),
            interface_type VARCHAR(100),
            trigger_modes VARCHAR(255),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # ------------------------------------------------------------------ #
    # 11. asset_locations  (movement history)                             #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE asset_locations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(id),
            location_id UUID NOT NULL REFERENCES locations(id),
            moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            moved_by UUID REFERENCES users(id),
            reason TEXT,
            notes TEXT
        )
    """)
    op.execute("CREATE INDEX ix_asset_locations_asset_id ON asset_locations(asset_id)")
    op.execute("CREATE INDEX ix_asset_locations_location_id ON asset_locations(location_id)")

    # ------------------------------------------------------------------ #
    # 12. Recreate calibrations, certificates, calibration_coefficients   #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE calibrations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(id),
            calibration_date DATE NOT NULL,
            due_date DATE NOT NULL,
            performed_by_user_id UUID REFERENCES users(id),
            performed_by_name VARCHAR(255) NOT NULL,
            external_lab_name VARCHAR(255),
            external_lab_accreditation VARCHAR(255),
            result calibration_result_enum NOT NULL,
            temperature_c DECIMAL(6, 2),
            humidity_pct DECIMAL(5, 2),
            pressure_hpa DECIMAL(8, 2),
            notes TEXT,
            calibration_file_id UUID REFERENCES files(id),
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_calibrations_asset_id ON calibrations(asset_id)")
    op.execute("CREATE INDEX ix_calibrations_calibration_date ON calibrations(calibration_date)")

    op.execute("""
        CREATE TABLE certificates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(id),
            calibration_id UUID REFERENCES calibrations(id),
            certificate_number VARCHAR(255) NOT NULL UNIQUE,
            issued_by VARCHAR(255) NOT NULL,
            accreditation_body VARCHAR(255),
            accreditation_number VARCHAR(255),
            issued_at DATE NOT NULL,
            valid_until DATE,
            file_id UUID REFERENCES files(id),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_certificates_asset_id ON certificates(asset_id)")

    op.execute("""
        CREATE TABLE calibration_coefficients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            calibration_id UUID NOT NULL REFERENCES calibrations(id),
            channel VARCHAR(50),
            coefficient_type coefficient_type_enum NOT NULL,
            offset_value DECIMAL(18, 8),
            gain DECIMAL(18, 8),
            poly_degree INTEGER,
            poly_coefficients JSONB,
            unit_input VARCHAR(50),
            unit_output VARCHAR(50),
            range_min DECIMAL(18, 4),
            range_max DECIMAL(18, 4),
            uncertainty DECIMAL(18, 8),
            uncertainty_coverage_factor DECIMAL(5, 3),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_calibration_coefficients_calibration_id ON calibration_coefficients(calibration_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calibration_coefficients CASCADE")
    op.execute("DROP TABLE IF EXISTS certificates CASCADE")
    op.execute("DROP TABLE IF EXISTS calibrations CASCADE")
    op.execute("DROP TABLE IF EXISTS asset_locations CASCADE")
    op.execute("DROP TABLE IF EXISTS daq CASCADE")
    op.execute("DROP TABLE IF EXISTS sensors CASCADE")
    op.execute("DROP TABLE IF EXISTS assets CASCADE")
    op.execute("DROP TABLE IF EXISTS locations CASCADE")
    op.execute("DROP TABLE IF EXISTS teams CASCADE")
    op.execute("DROP TYPE IF EXISTS asset_type_enum CASCADE")

    # Restore 001 state (old enums and tables)
    op.execute("CREATE TYPE asset_category_enum AS ENUM ('sensor', 'instrument', 'reference_standard', 'data_acquisition', 'other')")
    op.execute("CREATE TYPE sensor_type_enum AS ENUM ('temperature', 'pressure', 'flow', 'humidity', 'electrical', 'distance', 'angle', 'force', 'angular_speed', 'acceleration', 'other')")
    op.execute("CREATE TYPE instrument_type_enum AS ENUM ('transmitter', 'controller', 'indicator', 'recorder', 'other')")
    op.execute("CREATE TYPE daq_type_enum AS ENUM ('data_logger', 'signal_conditioner', 'gateway', 'other')")

    op.execute("""
        CREATE TABLE sites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            location TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            archived_at TIMESTAMPTZ,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE laboratories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES sites(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            archived_at TIMESTAMPTZ,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id VARCHAR(20) NOT NULL UNIQUE,
            laboratory_id UUID REFERENCES laboratories(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category asset_category_enum NOT NULL,
            manufacturer VARCHAR(255) NOT NULL,
            model VARCHAR(255) NOT NULL,
            serial_number VARCHAR(255),
            firmware_version VARCHAR(100),
            purchase_date DATE,
            warranty_expiry_date DATE,
            calibration_status calibration_status_enum NOT NULL DEFAULT 'not_calibrated',
            calibration_interval_days INTEGER,
            next_due_at TIMESTAMPTZ,
            health_score INTEGER NOT NULL DEFAULT 100,
            datasheet_file_id UUID REFERENCES files(id),
            notes TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            retired_at TIMESTAMPTZ,
            retired_by UUID REFERENCES users(id),
            retired_reason TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE sensors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL UNIQUE REFERENCES assets(id),
            sensor_type sensor_type_enum NOT NULL,
            measurement_range VARCHAR(100),
            measurement_unit VARCHAR(50),
            operating_range VARCHAR(100),
            operating_temperature_range VARCHAR(100),
            output_signal VARCHAR(100),
            output_signal_unit VARCHAR(50)
        )
    """)

    op.execute("""
        CREATE TABLE instruments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL UNIQUE REFERENCES assets(id),
            instrument_type instrument_type_enum NOT NULL,
            measurement_range VARCHAR(100),
            measurement_unit VARCHAR(50),
            operating_range VARCHAR(100),
            operating_temperature_range VARCHAR(100),
            output_signal VARCHAR(100),
            output_signal_unit VARCHAR(50)
        )
    """)

    op.execute("""
        CREATE TABLE data_acquisition (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL UNIQUE REFERENCES assets(id),
            daq_type daq_type_enum NOT NULL,
            input_channels INTEGER NOT NULL DEFAULT 0,
            output_channels INTEGER NOT NULL DEFAULT 0,
            sampling_rate_hz DECIMAL(10, 2),
            communication_protocol VARCHAR(100),
            adc_resolution DECIMAL(10, 2)
        )
    """)

    op.execute("""
        CREATE TABLE calibrations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(id),
            calibration_date DATE NOT NULL,
            due_date DATE NOT NULL,
            performed_by_user_id UUID REFERENCES users(id),
            performed_by_name VARCHAR(255) NOT NULL,
            external_lab_name VARCHAR(255),
            external_lab_accreditation VARCHAR(255),
            result calibration_result_enum NOT NULL,
            temperature_c DECIMAL(6, 2),
            humidity_pct DECIMAL(5, 2),
            pressure_hpa DECIMAL(8, 2),
            notes TEXT,
            calibration_file_id UUID REFERENCES files(id),
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE certificates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id UUID NOT NULL REFERENCES assets(id),
            calibration_id UUID REFERENCES calibrations(id),
            certificate_number VARCHAR(255) NOT NULL UNIQUE,
            issued_by VARCHAR(255) NOT NULL,
            accreditation_body VARCHAR(255),
            accreditation_number VARCHAR(255),
            issued_at DATE NOT NULL,
            valid_until DATE,
            file_id UUID REFERENCES files(id),
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE calibration_coefficients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            calibration_id UUID NOT NULL REFERENCES calibrations(id),
            channel VARCHAR(50),
            coefficient_type coefficient_type_enum NOT NULL,
            offset_value DECIMAL(18, 8),
            gain DECIMAL(18, 8),
            poly_degree INTEGER,
            poly_coefficients JSONB,
            unit_input VARCHAR(50),
            unit_output VARCHAR(50),
            range_min DECIMAL(18, 4),
            range_max DECIMAL(18, 4),
            uncertainty DECIMAL(18, 8),
            uncertainty_coverage_factor DECIMAL(5, 3),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE calibration_throughput (
            id SERIAL PRIMARY KEY,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            completed_count INTEGER NOT NULL DEFAULT 0,
            expired_count INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT uq_throughput_year_month UNIQUE (year, month)
        )
    """)
