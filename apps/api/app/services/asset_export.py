"""Build ZIP export bundles for one or more assets.

Read-only: no database writes happen here. Each asset is serialized to a
human-readable YAML file (asset.yaml) plus a media/ folder with the actual
bytes of its picture, datasheet, pinout/sensor images, attached files, and
calibration certificates. UUIDs for location/ownership/file ids are excluded
from the YAML — see the "asset import/export" guide doc for the full schema.
"""
import enum
import io
import uuid
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import yaml
from sqlalchemy.orm import Session

from ..models.asset import Asset
from ..models.calibration import Calibration
from ..models.calibration_method import Procedure
from ..models.location import Location
from ..models.stored_file import StoredFile
from ..models.team import Team
from ..repositories import asset as asset_repo
from ..repositories import calibration as cal_repo
from ..repositories import stored_file as file_repo
from . import storage as storage_svc

EXPORT_FORMAT_VERSION = 1

_CONTENT_TYPE_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

# (asset FK attribute, yaml presence-flag key, media/ base filename)
_ASSET_MEDIA_SPECS = [
    ("picture_id", "has_picture", "picture"),
    ("datasheet_file_id", "has_datasheet_file", "datasheet"),
    ("pinout_image_id", "has_pinout_image", "pinout_image"),
    ("sensor_image_id", "has_sensor_image", "sensor_image"),
    ("sensor_schematic_id", "has_sensor_schematic", "sensor_schematic"),
]


def _ext_for_file(stored: StoredFile) -> str:
    ext = _CONTENT_TYPE_EXT.get(stored.content_type)
    if ext:
        return ext
    if "." in stored.original_filename:
        return "." + stored.original_filename.rsplit(".", 1)[-1]
    return ".bin"


def _clean(value: Any) -> Any:
    """Make a DB value YAML-safe: enums -> value, Decimal -> float, UUID -> str."""
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _sorted_calibrations(db: Session, asset_pk: uuid.UUID) -> list[Calibration]:
    """Calibrations oldest -> newest, including voided ones — an export is a full
    historical backup, not a default list view. Shared by the yaml builder and the
    zip writer so `calibrations[i]` in the yaml always matches
    `media/calibrations/{i+1:03d}/` in the zip."""
    cals = cal_repo.list_by_asset(db, asset_pk, skip=0, limit=100_000, include_voided=True)
    return sorted(cals, key=lambda c: (c.calibration_date, c.created_at))


def _asset_attached_files(db: Session, asset_pk: uuid.UUID) -> list[StoredFile]:
    """Bulk-attached files (via /assets/{id}/files), in stable creation order."""
    return [f for f in file_repo.list_by_entity(db, asset_pk) if f.entity_type == "asset"]


def build_asset_yaml(db: Session, asset: Asset) -> dict:
    """Assemble the full export dict for one asset (not yet YAML-dumped)."""
    all_locs = {str(loc.id): loc for loc in db.query(Location).all()}
    site_name, location_name = asset_repo.resolve_location_path(asset.location_id, all_locs)

    owner_team_name = None
    if asset.owner:
        team = db.query(Team).filter(Team.id == asset.owner).first()
        if team:
            owner_team_name = team.name

    channels = asset_repo.get_sensor_channels(db, asset.id)
    daq = asset_repo.get_daq_details(db, asset.id)
    calibrations = _sorted_calibrations(db, asset.id)
    sensor_id_to_channel = {s.id: s.channel_id for s in channels}

    method_ids = {ch.calibration_method_id for ch in channels if ch.calibration_method_id}
    method_ids |= {c.internal_procedure_id for c in calibrations if c.internal_procedure_id}
    method_map: dict[uuid.UUID, str] = {}
    if method_ids:
        procs = db.query(Procedure).filter(Procedure.id.in_(method_ids)).all()
        method_map = {p.id: p.name for p in procs}

    asset_dict = {
        "asset_id": asset.asset_id,
        "asset_type": asset.asset_type,
        "name": asset.name,
        "description": asset.description,
        "manufacturer": asset.manufacturer,
        "model": asset.model,
        "serial_number": asset.serial_number,
        "manufacturer_part_number": asset.manufacturer_part_number,
        "datasheet_url": asset.datasheet_url,
        "firmware_version": asset.firmware_version,
        "power_supply": asset.power_supply,
        "power_consumption_w": asset.power_consumption_w,
        "dimensions": asset.dimensions,
        "weight_kg": asset.weight_kg,
        "mounting_type": asset.mounting_type,
        "connection_type": asset.connection_type,
        "displays_readings": asset.displays_readings,
        "ip_rating": asset.ip_rating,
        "hazardous_area_rating": asset.hazardous_area_rating,
        "operating_temperature_min": asset.operating_temperature_min,
        "operating_temperature_max": asset.operating_temperature_max,
        "operating_humidity_min": asset.operating_humidity_min,
        "operating_humidity_max": asset.operating_humidity_max,
        "health_score": asset.health_score,
        "price_eur": asset.price_eur,
        "purchase_date": asset.purchase_date,
        "warranty_expiry_date": asset.warranty_expiry_date,
        "is_active": asset.is_active,
        "retired_at": asset.retired_at,
        "retired_reason": asset.retired_reason,
        "version": asset.version,
        "notes": asset.notes,
        "pinout_table": asset.pinout_table,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "location_name": location_name,
        "site_name": site_name,
        "owner_team_name": owner_team_name,
        # Presence flags start optimistic (based on the FK being set) and are
        # corrected by _write_asset_into_zip once the actual download is attempted.
        **{flag: getattr(asset, fk) is not None for fk, flag, _ in _ASSET_MEDIA_SPECS},
    }

    sensor_channels = [
        {
            "channel_id": ch.channel_id,
            "physical_quantity": ch.physical_quantity,
            "measurement_type": ch.measurement_type,
            "unit": ch.unit,
            "technology": ch.technology,
            "measurement_min": ch.measurement_min,
            "measurement_max": ch.measurement_max,
            "accuracy_value": ch.accuracy_value,
            "accuracy_type": ch.accuracy_type,
            "accuracy_unit": ch.accuracy_unit,
            "resolution": ch.resolution,
            "resolution_unit": ch.resolution_unit,
            "measurement_uncertainty": ch.measurement_uncertainty,
            "uncertainty_unit": ch.uncertainty_unit,
            "confidence_level": ch.confidence_level,
            "coverage_factor": ch.coverage_factor,
            "drift_rate": ch.drift_rate,
            "drift_unit": ch.drift_unit,
            "sensitivity": ch.sensitivity,
            "sensitivity_unit": ch.sensitivity_unit,
            "response_time_ms": ch.response_time_ms,
            "bandwidth_hz": ch.bandwidth_hz,
            "output_signal_min": ch.output_signal_min,
            "output_signal_max": ch.output_signal_max,
            "output_signal_unit": ch.output_signal_unit,
            "output_type": ch.output_type,
            "calibration_role": ch.calibration_role,
            "criticality": ch.criticality,
            "calibration_interval": ch.calibration_interval,
            "is_active": ch.is_active,
            "calibration_method_name": method_map.get(ch.calibration_method_id),
        }
        for ch in channels
    ]

    daq_details = None
    if daq:
        daq_details = {
            "daq_type": daq.daq_type,
            "input_channels": daq.input_channels,
            "output_channels": daq.output_channels,
            "input_signal_types": daq.input_signal_types,
            "output_signal_types": daq.output_signal_types,
            "sampling_rate_hz": daq.sampling_rate_hz,
            "per_channel_sampling_rate_hz": daq.per_channel_sampling_rate_hz,
            "adc_resolution_bits": daq.adc_resolution_bits,
            "adc_type": daq.adc_type,
            "input_voltage_range_min": daq.input_voltage_range_min,
            "input_voltage_range_max": daq.input_voltage_range_max,
            "input_impedance_ohm": daq.input_impedance_ohm,
            "noise_floor_uv_rms": daq.noise_floor_uv_rms,
            "dynamic_range_db": daq.dynamic_range_db,
            "synchronization_supported": daq.synchronization_supported,
            "clock_source": daq.clock_source,
            "time_sync_precision_ns": daq.time_sync_precision_ns,
            "jitter_ns": daq.jitter_ns,
            "communication_protocol": daq.communication_protocol,
            "interface_type": daq.interface_type,
            "trigger_modes": daq.trigger_modes,
            "is_active": daq.is_active,
        }

    calibrations_list = []
    for cal in calibrations:
        points = cal_repo.list_points(db, cal.id)
        calibration_location_name = None
        if cal.calibration_location_id:
            loc = all_locs.get(str(cal.calibration_location_id))
            if loc:
                calibration_location_name = loc.name
        calibrations_list.append({
            "calibration_date": cal.calibration_date,
            "due_date": cal.due_date,
            "performed_by_name": cal.performed_by_name,
            "external_lab_name": cal.external_lab_name,
            "notes": cal.notes,
            "created_at": cal.created_at,
            "channel_id": sensor_id_to_channel.get(cal.sensor_id),
            "calibration_type": cal.calibration_type,
            "calibration_version": cal.calibration_version,
            "is_active": cal.is_active,
            "void_reason": cal.void_reason,
            "calibration_interval": cal.calibration_interval,
            "tolerance_criteria": cal.tolerance_criteria,
            "external_lab_certificate_number": cal.external_lab_certificate_number,
            "internal_procedure_name": method_map.get(cal.internal_procedure_id),
            "calibration_location_name": calibration_location_name,
            "temperature": cal.temperature,
            "humidity": cal.humidity,
            "pressure": cal.pressure,
            "poly_order": cal.poly_order,
            "poly_coefficients": cal.poly_coefficients,
            "range_min": cal.range_min,
            "range_max": cal.range_max,
            "r_squared": cal.r_squared,
            "rmse": cal.rmse,
            "standard_error": cal.standard_error,
            "max_error": cal.max_error,
            "full_scale_error": cal.full_scale_error,
            "non_linearity": cal.non_linearity,
            "repeatability": cal.repeatability,
            "hysteresis": cal.hysteresis,
            "distribution_type": cal.distribution_type,
            "confidence_level": cal.confidence_level,
            "coverage_factor": cal.coverage_factor,
            "combined_uncertainty": cal.combined_uncertainty,
            "expanded_uncertainty": cal.expanded_uncertainty,
            "valid_range_min": cal.valid_range_min,
            "valid_range_max": cal.valid_range_max,
            "uncertainty_budget": cal.uncertainty_budget,
            "effective_degrees_of_freedom": cal.effective_degrees_of_freedom,
            "poly_coefficients_covariance": cal.poly_coefficients_covariance,
            "decision_rule": cal.decision_rule,
            "conformity_statement": cal.conformity_statement,
            "has_certificate_file": cal.calibration_file_id is not None,
            "data_points": [
                {
                    "point_index": p.point_index,
                    "reference_value": p.reference_value,
                    "measured_value": p.measured_value,
                    "calculated_value": p.calculated_value,
                    "residual_abs": p.residual_abs,
                    "residual_pct": p.residual_pct,
                    "reference_unit": p.reference_unit,
                    "measured_unit": p.measured_unit,
                }
                for p in points
            ],
        })

    files_meta = [
        {
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "size_bytes": f.size_bytes,
            "checksum_sha256": f.checksum_sha256,
            "created_at": f.created_at,
            "media_path": None,  # filled in by _write_asset_into_zip
        }
        for f in _asset_attached_files(db, asset.id)
    ]

    data = {
        "export_format_version": EXPORT_FORMAT_VERSION,
        "exported_at": datetime.now(timezone.utc),
        "asset": asset_dict,
        "sensor_channels": sensor_channels,
        "daq_details": daq_details,
        "calibrations": calibrations_list,
        "files": files_meta,
    }
    return _clean(data)


def _write_asset_into_zip(zf: zipfile.ZipFile, db: Session, asset: Asset) -> None:
    """Write one asset's asset.yaml + media/ into an already-open zip file."""
    data = build_asset_yaml(db, asset)
    folder = asset.asset_id
    asset_dict = data["asset"]

    for fk_attr, flag_key, base_name in _ASSET_MEDIA_SPECS:
        file_id = getattr(asset, fk_attr)
        written = False
        if file_id:
            stored = file_repo.get_by_id(db, file_id)
            if stored:
                content = storage_svc.download_file(stored.storage_path, stored.bucket)
                if content is not None:
                    zf.writestr(f"{folder}/media/{base_name}{_ext_for_file(stored)}", content)
                    written = True
        asset_dict[flag_key] = written

    used_names: set[str] = set()
    for entry, stored in zip(data["files"], _asset_attached_files(db, asset.id)):
        content = storage_svc.download_file(stored.storage_path, stored.bucket)
        if content is None:
            continue
        name = stored.original_filename
        if name in used_names:
            stem, _, suffix = name.rpartition(".")
            n = 1
            while True:
                candidate = f"{stem} ({n}).{suffix}" if suffix else f"{name} ({n})"
                if candidate not in used_names:
                    name = candidate
                    break
                n += 1
        used_names.add(name)
        media_path = f"media/files/{name}"
        zf.writestr(f"{folder}/{media_path}", content)
        entry["media_path"] = media_path

    for idx, (cal_entry, cal) in enumerate(zip(data["calibrations"], _sorted_calibrations(db, asset.id)), start=1):
        if not cal.calibration_file_id:
            continue
        stored = file_repo.get_by_id(db, cal.calibration_file_id)
        if not stored:
            cal_entry["has_certificate_file"] = False
            continue
        content = storage_svc.download_file(stored.storage_path, stored.bucket)
        if content is None:
            cal_entry["has_certificate_file"] = False
            continue
        zf.writestr(f"{folder}/media/calibrations/{idx:03d}/certificate.pdf", content)

    yaml_bytes = yaml.safe_dump(data, sort_keys=False, allow_unicode=True).encode("utf-8")
    zf.writestr(f"{folder}/asset.yaml", yaml_bytes)


def build_asset_export_zip(db: Session, asset: Asset) -> bytes:
    """Export a single asset as a standalone zip: {asset_id}/asset.yaml + media/."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        _write_asset_into_zip(zf, db, asset)
    return buf.getvalue()


def build_bulk_export_zip(db: Session, assets: list[Asset]) -> bytes:
    """Export multiple assets into one zip, one {asset_id}/ folder per asset."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for asset in assets:
            _write_asset_into_zip(zf, db, asset)
    return buf.getvalue()
