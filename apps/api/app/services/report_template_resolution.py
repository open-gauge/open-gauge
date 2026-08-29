"""Resolves which template renders a calibration's report.

Priority order: the calibration's own override (set via PUT /calibrations/{id}/report-template)
beats the sensor/channel's default, which beats the existing org/global/built-in LaTeX-only
fallback (`certificate_service.resolve_template_source`). A "document" kind means an
editor-authored template (see document_template_latex.py); "certificate" means a hand-authored
.tex upload, rendered by the existing latex_service/certificate_service pipeline unchanged.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from ..models.calibration import Calibration
    from ..models.sensor import Sensor


@dataclass
class ResolvedReportTemplate:
    kind: Literal["certificate", "document"]
    # None only when kind == "certificate" and nothing was explicitly assigned — the existing
    # resolve_template_source() org/global/built-in fallback applies in that case.
    template_id: uuid.UUID | None


def resolve_report_template(calibration: "Calibration", sensor: "Sensor | None") -> ResolvedReportTemplate:
    if calibration.report_document_template_id:
        return ResolvedReportTemplate(kind="document", template_id=calibration.report_document_template_id)
    if calibration.report_certificate_template_id:
        return ResolvedReportTemplate(kind="certificate", template_id=calibration.report_certificate_template_id)
    if sensor and sensor.default_document_template_id:
        return ResolvedReportTemplate(kind="document", template_id=sensor.default_document_template_id)
    if sensor and sensor.default_certificate_template_id:
        return ResolvedReportTemplate(kind="certificate", template_id=sensor.default_certificate_template_id)
    return ResolvedReportTemplate(kind="certificate", template_id=None)
