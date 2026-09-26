"""Resolves which template renders a calibration's report.

Priority order: the calibration's own override (set via PUT /calibrations/{id}/report-template)
beats the sensor/channel's default, which beats the org-wide "default" template an admin marked in
Admin -> Templates -> Calibration reports (`template_defaults_service.get_report_default`), which
beats the built-in Open Gauge layout as the final safety net. A "document" kind means an
editor-authored template (see document_template_latex.py); "certificate" means a hand-authored
.tex upload, rendered by the existing latex_service/certificate_service pipeline unchanged.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from ..models.calibration import Calibration
    from ..models.sensor import Sensor


@dataclass
class ResolvedReportTemplate:
    kind: Literal["certificate", "document"]
    # None only when kind == "certificate" and nothing resolved at all — the built-in template
    # read straight off disk (certificate_service.resolve_template_source) is the final fallback.
    template_id: uuid.UUID | None


def resolve_report_template(db: Session, calibration: "Calibration", sensor: "Sensor | None") -> ResolvedReportTemplate:
    from ..services import template_defaults_service

    if calibration.report_document_template_id:
        return ResolvedReportTemplate(kind="document", template_id=calibration.report_document_template_id)
    if calibration.report_certificate_template_id:
        return ResolvedReportTemplate(kind="certificate", template_id=calibration.report_certificate_template_id)
    if sensor and sensor.default_document_template_id:
        return ResolvedReportTemplate(kind="document", template_id=sensor.default_document_template_id)
    if sensor and sensor.default_certificate_template_id:
        return ResolvedReportTemplate(kind="certificate", template_id=sensor.default_certificate_template_id)
    default = template_defaults_service.get_report_default(db)
    if default:
        kind, template_id = default
        return ResolvedReportTemplate(kind=kind, template_id=template_id)
    return ResolvedReportTemplate(kind="certificate", template_id=None)
