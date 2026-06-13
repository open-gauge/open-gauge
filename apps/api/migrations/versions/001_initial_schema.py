"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-17
"""

from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old tables and types from the initial create_all() schema
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS calibration_throughput CASCADE")
    op.execute("DROP TABLE IF EXISTS assets CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TYPE IF EXISTS asset_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS calibration_status_enum CASCADE")

    # Enable pgcrypto for gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # Enum types
    op.execute("CREATE TYPE user_role_enum AS ENUM ('superadmin', 'admin', 'technician', 'viewer')")
    op.execute("CREATE TYPE asset_category_enum AS ENUM ('sensor', 'instrument', 'reference_standard', 'data_acquisition', 'other')")
    op.execute("CREATE TYPE calibration_status_enum AS ENUM ('valid', 'due_soon', 'expired', 'not_calibrated')")
    op.execute("CREATE TYPE calibration_result_enum AS ENUM ('pass', 'fail', 'conditional_pass')")
    op.execute("CREATE TYPE coefficient_type_enum AS ENUM ('linear', 'polynomial')")
    op.execute("CREATE TYPE sensor_type_enum AS ENUM ('temperature', 'pressure', 'flow', 'humidity', 'electrical', 'distance', 'angle', 'force', 'angular_speed', 'acceleration', 'other')")
    op.execute("CREATE TYPE instrument_type_enum AS ENUM ('transmitter', 'controller', 'indicator', 'recorder', 'other')")
    op.execute("CREATE TYPE daq_type_enum AS ENUM ('data_logger', 'signal_conditioner', 'gateway', 'other')")

    # organizations
    op.execute("""
        CREATE TABLE organizations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # users
    op.execute("""
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID REFERENCES organizations(id),
            email VARCHAR(255) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            hashed_password VARCHAR(255),
            role user_role_enum NOT NULL DEFAULT 'viewer',
            team VARCHAR(255),
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_superuser BOOLEAN NOT NULL DEFAULT false,
            last_login_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_users_email ON users(email)")

    # sites
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

    # laboratories
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

    # files
    op.execute("""
        CREATE TABLE files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            original_filename VARCHAR(500) NOT NULL,
            storage_path VARCHAR(1000) NOT NULL,
            bucket VARCHAR(255) NOT NULL,
            content_type VARCHAR(100) NOT NULL,
            size_bytes BIGINT NOT NULL,
            checksum_sha256 VARCHAR(64) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id UUID,
            uploaded_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # assets
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
    op.execute("CREATE INDEX ix_assets_asset_id ON assets(asset_id)")
    op.execute("CREATE INDEX ix_assets_calibration_status ON assets(calibration_status)")
    op.execute("CREATE INDEX ix_assets_next_due_at ON assets(next_due_at)")
    op.execute("CREATE INDEX ix_assets_laboratory_id ON assets(laboratory_id)")

    # sensors
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

    # instruments
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

    # data_acquisition
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

    # calibrations
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

    # certificates
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

    # calibration_coefficients
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

    # audit_logs
    op.execute("""
        CREATE TABLE audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_id UUID REFERENCES users(id),
            actor_email VARCHAR(255) NOT NULL,
            action VARCHAR(100) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id UUID,
            entity_asset_id VARCHAR(20),
            before_state JSONB,
            after_state JSONB,
            ip_address VARCHAR(45),
            user_agent VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_audit_logs_actor_id ON audit_logs(actor_id)")
    op.execute("CREATE INDEX ix_audit_logs_entity_id ON audit_logs(entity_id)")
    op.execute("CREATE INDEX ix_audit_logs_action ON audit_logs(action)")
    op.execute("CREATE INDEX ix_audit_logs_created_at ON audit_logs(created_at)")

    # calibration_throughput
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


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calibration_throughput CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS calibration_coefficients CASCADE")
    op.execute("DROP TABLE IF EXISTS certificates CASCADE")
    op.execute("DROP TABLE IF EXISTS calibrations CASCADE")
    op.execute("DROP TABLE IF EXISTS data_acquisition CASCADE")
    op.execute("DROP TABLE IF EXISTS instruments CASCADE")
    op.execute("DROP TABLE IF EXISTS sensors CASCADE")
    op.execute("DROP TABLE IF EXISTS assets CASCADE")
    op.execute("DROP TABLE IF EXISTS files CASCADE")
    op.execute("DROP TABLE IF EXISTS laboratories CASCADE")
    op.execute("DROP TABLE IF EXISTS sites CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS organizations CASCADE")
    op.execute("DROP TYPE IF EXISTS daq_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS instrument_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS sensor_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS coefficient_type_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS calibration_result_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS calibration_status_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS asset_category_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS user_role_enum CASCADE")
