"""
Shared helpers for building granular, field-level audit log diffs.

`AuditLog.before_state`/`after_state` (JSONB) are meant to hold ONLY the fields that actually
changed, as flat `{field_name: value}` maps sharing the same key set — never a whole-object dump
(which drowns real changes in noise and, worse, still "changes" a field that was PUT back with
its existing value). Nested entities (e.g. an asset's sensor channels) namespace their keys as
`"channel.<channel_id>.<field>"` — see `app/repositories/asset.py::update()` for the one place
that needs it; every other entity is flat and just calls `snapshot()`/`diff_snapshots()` directly
in its route handler.
"""
from __future__ import annotations

import enum
import uuid
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal
from typing import Any


def json_safe(value: object) -> object:
    """Convert a single ORM attribute value into something JSONB can store as-is."""
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    return value


def snapshot(obj: object, fields: Iterable[str]) -> dict[str, Any]:
    """JSON-safe `{field: value}` for the given attribute names on an ORM object."""
    return {field: json_safe(getattr(obj, field, None)) for field in fields}


def diff_snapshots(before: dict[str, Any], after: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Compare two same-shaped snapshots; return `(before_changed, after_changed)` containing
    only the keys whose value actually differs."""
    before_changed: dict[str, Any] = {}
    after_changed: dict[str, Any] = {}
    for key in before.keys() | after.keys():
        old_value = before.get(key)
        new_value = after.get(key)
        if old_value != new_value:
            before_changed[key] = old_value
            after_changed[key] = new_value
    return before_changed, after_changed
