"""Parse and apply asset export ZIP bundles (see asset_export.py for the format).

Each top-level folder in the zip that contains an asset.yaml is imported as one
new asset, independently of the others: a bad folder fails on its own without
aborting the rest of the batch (see import_assets_zip). Calibration history is
recreated verbatim (calibration_version and all statistics are copied as-is,
never recomputed) since it represents historical fact, not a new event.

Note: this module builds rows directly via `db.add()`/`db.flush()` rather than
reusing `asset_repo.create()`/`asset_repo.duplicate()`, because those repository
functions call `db.commit()` internally, which would end the per-folder
SAVEPOINT used here to isolate one bad asset from the rest of the batch.
"""
import logging
import uuid
import zipfile
from io import BytesIO

import yaml
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetType
from ..models.asset_location import AssetLocation
from ..models.calibration import Calibration
from ..models.calibration_method import Procedure
from ..models.calibration_point import CalibrationData
from ..models.daq import DAQ
from ..models.sensor import Sensor
from ..models.stored_file import StoredFile
from ..repositories import asset as asset_repo
from ..schemas.asset_import import AssetImportPreview, AssetImportResult, ImportedAssetYaml
from . import storage as storage_svc

logger = logging.getLogger(__name__)

_EXT_CONTENT_TYPE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}

# (yaml presence-flag, media/ base filename, Asset FK column, StoredFile entity_type)
_ASSET_MEDIA_SPECS = [
    ("has_picture", "picture", "picture_id", "asset_picture"),
    ("has_datasheet_file", "datasheet", "datasheet_file_id", "asset"),
    ("has_pinout_image", "pinout_image", "pinout_image_id", "asset"),
    ("has_sensor_image", "sensor_image", "sensor_image_id", "asset"),
    ("has_sensor_schematic", "sensor_schematic", "sensor_schematic_id", "asset"),
]


class AssetImportError(Exception):
    """Raised for any per-asset import failure; caught per-folder in
    import_assets_zip so one bad asset doesn't abort the rest of the batch."""


def _extract_asset_folders(zf: zipfile.ZipFile) -> tuple[list[str], list[str]]:
    """Return (folders containing asset.yaml, top-level folders that don't)."""
    top_level_dirs: set[str] = set()
    has_yaml: set[str] = set()
    for name in zf.namelist():
        if "/" not in name:
            continue
        top = name.split("/", 1)[0]
        top_level_dirs.add(top)
        if name == f"{top}/asset.yaml":
            has_yaml.add(top)
    return sorted(has_yaml), sorted(top_level_dirs - has_yaml)


def _find_media_file(zf: zipfile.ZipFile, folder: str, base_name: str) -> str | None:
    """Locate a media/<base_name>.<ext> entry regardless of extension (the
    extension isn't recorded in the yaml, only a has_* presence flag)."""
    prefix = f"{folder}/media/{base_name}."
    for name in zf.namelist():
        if name.startswith(prefix):
            return name
    return None


def _load_asset_yaml(zf: zipfile.ZipFile, folder: str) -> ImportedAssetYaml:
    try:
        raw = yaml.safe_load(zf.read(f"{folder}/asset.yaml"))
    except yaml.YAMLError as e:
        raise AssetImportError(f"Could not parse asset.yaml: {e}") from e
    if not isinstance(raw, dict):
        raise AssetImportError("asset.yaml is empty or not a mapping")
    try:
        return ImportedAssetYaml(**raw)
    except ValidationError as e:
        raise AssetImportError(f"asset.yaml failed validation: {e}") from e


def _resolve_procedure_id(db: Session, name: str | None) -> uuid.UUID | None:
    if not name:
        return None
    proc = db.query(Procedure).filter(func.lower(Procedure.name) == name.lower()).first()
    return proc.id if proc else None


def _restore_media_file(
    db: Session,
    content: bytes,
    *,
    original_filename: str,
    content_type: str,
    entity_type: str,
    entity_id: uuid.UUID,
    uploaded_by: uuid.UUID,
) -> uuid.UUID:
    """Upload one media file's bytes back into MinIO and record it as a StoredFile.

    Builds the row directly (db.add + db.flush) rather than calling
    stored_file_repo.create(), which commits internally — incompatible with
    the per-folder SAVEPOINT used by import_assets_zip."""
    object_path = storage_svc.unique_object_name(f"{entity_type}/{entity_id}", original_filename)
    bucket, path, size = storage_svc.upload_file(content, content_type, object_path)
    record = StoredFile(
        original_filename=original_filename,
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=storage_svc.sha256_hex(content),
        entity_type=entity_type,
        entity_id=entity_id,
        uploaded_by=uploaded_by,
    )
    db.add(record)
    db.flush()
    return record.id


def import_asset_from_folder(
    db: Session,
    zf: zipfile.ZipFile,
    folder: str,
    created_by: uuid.UUID,
    location_id: uuid.UUID | None = None,
    owner: uuid.UUID | None = None,
) -> Asset:
    imported = _load_asset_yaml(zf, folder)
    a = imported.asset

    if asset_repo.get_by_asset_id(db, a.asset_id):
        raise AssetImportError(f"Asset ID '{a.asset_id}' already exists")

    new_asset = Asset(
        asset_id=a.asset_id,
        asset_type=AssetType(a.asset_type),
        name=a.name,
        description=a.description,
        manufacturer=a.manufacturer,
        model=a.model,
        serial_number=a.serial_number,
        manufacturer_part_number=a.manufacturer_part_number,
        location_id=location_id,
        owner=owner,
        datasheet_url=a.datasheet_url,
        firmware_version=a.firmware_version,
        power_supply=a.power_supply,
        power_consumption_w=a.power_consumption_w,
        dimensions=a.dimensions,
        weight_kg=a.weight_kg,
        mounting_type=a.mounting_type,
        connection_type=a.connection_type,
        displays_readings=a.displays_readings,
        ip_rating=a.ip_rating,
        hazardous_area_rating=a.hazardous_area_rating,
        operating_temperature_min=a.operating_temperature_min,
        operating_temperature_max=a.operating_temperature_max,
        operating_humidity_min=a.operating_humidity_min,
        operating_humidity_max=a.operating_humidity_max,
        health_score=a.health_score,
        price_eur=a.price_eur,
        purchase_date=a.purchase_date,
        warranty_expiry_date=a.warranty_expiry_date,
        notes=a.notes,
        pinout_table=a.pinout_table,
        is_active=a.is_active,
        retired_at=a.retired_at,
        retired_by=None,
        retired_reason=a.retired_reason,
        created_by=created_by,
    )
    db.add(new_asset)
    db.flush()

    if location_id:
        db.add(AssetLocation(
            asset_id=new_asset.id,
            location_id=location_id,
            moved_by=created_by,
            reason="Imported",
        ))

    channel_to_sensor_id: dict[str, uuid.UUID] = {}
    for ch in imported.sensor_channels:
        sensor = Sensor(
            asset_id=new_asset.id,
            channel_id=ch.channel_id,
            physical_quantity=ch.physical_quantity,
            measurement_type=ch.measurement_type,
            unit=ch.unit,
            technology=ch.technology,
            measurement_min=ch.measurement_min,
            measurement_max=ch.measurement_max,
            accuracy_value=ch.accuracy_value,
            accuracy_type=ch.accuracy_type,
            accuracy_unit=ch.accuracy_unit,
            resolution=ch.resolution,
            resolution_unit=ch.resolution_unit,
            measurement_uncertainty=ch.measurement_uncertainty,
            uncertainty_unit=ch.uncertainty_unit,
            confidence_level=ch.confidence_level,
            coverage_factor=ch.coverage_factor,
            drift_rate=ch.drift_rate,
            drift_unit=ch.drift_unit,
            sensitivity=ch.sensitivity,
            sensitivity_unit=ch.sensitivity_unit,
            response_time_ms=ch.response_time_ms,
            bandwidth_hz=ch.bandwidth_hz,
            output_signal_min=ch.output_signal_min,
            output_signal_max=ch.output_signal_max,
            output_signal_unit=ch.output_signal_unit,
            output_type=ch.output_type,
            calibration_role=ch.calibration_role,
            criticality=ch.criticality,
            calibration_method_id=_resolve_procedure_id(db, ch.calibration_method_name),
            calibration_interval=ch.calibration_interval,
            is_active=ch.is_active,
        )
        db.add(sensor)
        db.flush()
        channel_to_sensor_id[ch.channel_id] = sensor.id

    if imported.daq_details:
        d = imported.daq_details
        db.add(DAQ(
            asset_id=new_asset.id,
            daq_type=d.daq_type,
            input_channels=d.input_channels,
            output_channels=d.output_channels,
            input_signal_types=d.input_signal_types,
            output_signal_types=d.output_signal_types,
            sampling_rate_hz=d.sampling_rate_hz,
            per_channel_sampling_rate_hz=d.per_channel_sampling_rate_hz,
            adc_resolution_bits=d.adc_resolution_bits,
            adc_type=d.adc_type,
            input_voltage_range_min=d.input_voltage_range_min,
            input_voltage_range_max=d.input_voltage_range_max,
            input_impedance_ohm=d.input_impedance_ohm,
            noise_floor_uv_rms=d.noise_floor_uv_rms,
            dynamic_range_db=d.dynamic_range_db,
            synchronization_supported=d.synchronization_supported,
            clock_source=d.clock_source,
            time_sync_precision_ns=d.time_sync_precision_ns,
            jitter_ns=d.jitter_ns,
            communication_protocol=d.communication_protocol,
            interface_type=d.interface_type,
            trigger_modes=d.trigger_modes,
            is_active=d.is_active,
        ))
        db.flush()

    for idx, cal in enumerate(imported.calibrations, start=1):
        new_cal = Calibration(
            asset_id=new_asset.id,
            calibration_date=cal.calibration_date,
            due_date=cal.due_date,
            performed_by_user_id=None,
            performed_by_name=cal.performed_by_name,
            external_lab_name=cal.external_lab_name,
            notes=cal.notes,
            created_by=created_by,
            sensor_id=channel_to_sensor_id.get(cal.channel_id) if cal.channel_id else None,
            calibration_type=cal.calibration_type,
            calibration_version=cal.calibration_version,
            is_active=cal.is_active,
            void_reason=cal.void_reason,
            calibration_interval=cal.calibration_interval,
            tolerance_criteria=cal.tolerance_criteria,
            internal_reference_asset_id=None,
            internal_procedure_id=_resolve_procedure_id(db, cal.internal_procedure_name),
            external_lab_certificate_number=cal.external_lab_certificate_number,
            daq_id=None,
            calibration_location_id=None,
            temperature=cal.temperature,
            humidity=cal.humidity,
            pressure=cal.pressure,
            poly_order=cal.poly_order,
            poly_coefficients=cal.poly_coefficients,
            range_min=cal.range_min,
            range_max=cal.range_max,
            r_squared=cal.r_squared,
            rmse=cal.rmse,
            standard_error=cal.standard_error,
            max_error=cal.max_error,
            full_scale_error=cal.full_scale_error,
            non_linearity=cal.non_linearity,
            repeatability=cal.repeatability,
            hysteresis=cal.hysteresis,
            distribution_type=cal.distribution_type,
            confidence_level=cal.confidence_level,
            coverage_factor=cal.coverage_factor,
            combined_uncertainty=cal.combined_uncertainty,
            expanded_uncertainty=cal.expanded_uncertainty,
            valid_range_min=cal.valid_range_min,
            valid_range_max=cal.valid_range_max,
            uncertainty_budget=cal.uncertainty_budget,
            effective_degrees_of_freedom=cal.effective_degrees_of_freedom,
            poly_coefficients_covariance=cal.poly_coefficients_covariance,
            decision_rule=cal.decision_rule,
            conformity_statement=cal.conformity_statement,
        )
        db.add(new_cal)
        db.flush()

        first_point_id: uuid.UUID | None = None
        for pt in cal.data_points:
            row = CalibrationData(
                calibration_id=new_cal.id,
                point_index=pt.point_index,
                reference_value=pt.reference_value,
                measured_value=pt.measured_value,
                calculated_value=pt.calculated_value,
                residual_abs=pt.residual_abs,
                residual_pct=pt.residual_pct,
                reference_unit=pt.reference_unit,
                measured_unit=pt.measured_unit,
            )
            db.add(row)
            db.flush()
            if first_point_id is None:
                first_point_id = row.id
        if first_point_id is not None:
            new_cal.calibration_data_id = first_point_id

        if cal.has_certificate_file:
            zip_path = f"{folder}/media/calibrations/{idx:03d}/certificate.pdf"
            try:
                content = zf.read(zip_path)
            except KeyError:
                content = None
            if content is not None:
                new_cal.calibration_file_id = _restore_media_file(
                    db, content,
                    original_filename="certificate.pdf",
                    content_type="application/pdf",
                    entity_type="calibration",
                    entity_id=new_cal.id,
                    uploaded_by=created_by,
                )

    for flag_key, base_name, fk_attr, entity_type in _ASSET_MEDIA_SPECS:
        if not getattr(a, flag_key):
            continue
        zip_path = _find_media_file(zf, folder, base_name)
        if not zip_path:
            continue
        ext = zip_path.rsplit(".", 1)[-1].lower()
        content_type = _EXT_CONTENT_TYPE.get(f".{ext}", "application/octet-stream")
        file_id = _restore_media_file(
            db, zf.read(zip_path),
            original_filename=zip_path.rsplit("/", 1)[-1],
            content_type=content_type,
            entity_type=entity_type,
            entity_id=new_asset.id,
            uploaded_by=created_by,
        )
        setattr(new_asset, fk_attr, file_id)

    for f in imported.files:
        if not f.media_path:
            continue
        zip_path = f"{folder}/{f.media_path}"
        try:
            content = zf.read(zip_path)
        except KeyError:
            continue
        _restore_media_file(
            db, content,
            original_filename=f.original_filename,
            content_type=f.content_type,
            entity_type="asset",
            entity_id=new_asset.id,
            uploaded_by=created_by,
        )

    db.flush()
    return new_asset


def import_assets_zip(
    db: Session,
    zip_bytes: bytes,
    created_by: uuid.UUID,
    location_id: uuid.UUID | None = None,
    owner: uuid.UUID | None = None,
) -> list[AssetImportResult]:
    """Import every asset folder found in a zip. Returns one result per folder;
    a failure in one folder never prevents the others from being imported.

    location_id/owner (when given) are applied to every asset created in this
    call — set by the "Import from file" flow, which only ever imports a
    single asset and lets the user pick both from a dropdown first."""
    try:
        zf = zipfile.ZipFile(BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return [AssetImportResult(source_folder="", status="error", error_message="Not a valid zip file")]

    folders, missing = _extract_asset_folders(zf)
    if not folders and not missing:
        return [AssetImportResult(
            source_folder="", status="error",
            error_message="No asset.yaml found in any top-level folder of this zip",
        )]

    results: list[AssetImportResult] = []
    for name in sorted(set(folders) | set(missing)):
        if name in missing:
            results.append(AssetImportResult(
                source_folder=name, status="error",
                error_message="No asset.yaml found in this folder",
            ))
            continue
        try:
            with db.begin_nested():
                asset = import_asset_from_folder(
                    db, zf, name, created_by, location_id=location_id, owner=owner
                )
            results.append(AssetImportResult(
                source_folder=name, status="created",
                asset_id=asset.asset_id, new_asset_pk=asset.id,
            ))
        except AssetImportError as e:
            results.append(AssetImportResult(source_folder=name, status="error", error_message=str(e)))
        except Exception:
            logger.exception("Unexpected error importing asset folder %s", name)
            results.append(AssetImportResult(
                source_folder=name, status="error",
                error_message="Import failed: internal error",
            ))

    return results


def preview_asset_zip(zip_bytes: bytes) -> AssetImportPreview:
    """Validate a zip meant for the single-asset "Import from file" flow
    without creating anything: it must contain exactly one top-level folder,
    and that folder's asset.yaml must parse and validate cleanly."""
    try:
        zf = zipfile.ZipFile(BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return AssetImportPreview(valid=False, error_message="Not a valid zip file")

    folders, missing = _extract_asset_folders(zf)
    total = len(folders) + len(missing)
    if total != 1:
        return AssetImportPreview(
            valid=False,
            error_message=f"Expected exactly one asset folder, found {total}",
        )
    if missing:
        return AssetImportPreview(valid=False, error_message="No asset.yaml found in this folder")

    try:
        imported = _load_asset_yaml(zf, folders[0])
    except AssetImportError as e:
        return AssetImportPreview(valid=False, error_message=str(e))

    return AssetImportPreview(
        valid=True,
        asset_id=imported.asset.asset_id,
        name=imported.asset.name,
        manufacturer=imported.asset.manufacturer,
        model=imported.asset.model,
        asset_type=imported.asset.asset_type,
        channel_count=len(imported.sensor_channels),
        calibration_count=len(imported.calibrations),
    )
