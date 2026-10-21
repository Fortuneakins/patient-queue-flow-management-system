from __future__ import annotations

from datetime import datetime, timezone
from math import ceil
from statistics import median
from typing import Iterable, Any

DEFAULT_SERVICE_MINUTES = 12.0
BUFFER = 1.15
MIN_SAMPLES_FOR_CALIBRATION = 5
ROBUST_SAMPLES = 30


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


def _valid_tier(value: Any) -> int:
    try:
        tier = int(value or 4)
    except (TypeError, ValueError, OverflowError):
        return 4
    return tier if 1 <= tier <= 4 else 4


def estimate_waits(
    visits: Iterable[dict],
    on_duty_doctors: int,
    now: datetime | None = None,
    service_minutes: Iterable[float] | None = None,
) -> dict[str, int | None]:
    """
    Produce a transparent operational queue estimate.

    Estimates model the workload ahead of a hypothetical new visit at each
    assigned tier: waiting visits with an equal or higher priority, plus a
    conservative half-service-time allowance for each ongoing consultation.
    All workload is divided across currently staffed doctors and buffered.
    This is a planning approximation, not an individual guarantee.
    """
    current = now or datetime.now(timezone.utc)
    rows = []
    for item in visits:
        if not isinstance(item, dict):
            continue
        status = item.get("status")
        if status not in {"Waiting", "In-Consultation"}:
            continue
        tier = _valid_tier(item.get("priority_level"))
        queued_at = _parse_datetime(item.get("queued_at"))
        called_at = _parse_datetime(item.get("called_at"))
        rows.append({
            "tier": tier,
            "status": status,
            "queued_at": queued_at or current,
            "called_at": called_at,
        })

    observed = []
    for value in (service_minutes or []):
        try:
            number = float(value)
        except (TypeError, ValueError, OverflowError):
            continue
        if 1 <= number <= 240:
            observed.append(number)
    observed = observed[:500]
    service_time = median(observed) if len(observed) >= MIN_SAMPLES_FOR_CALIBRATION else DEFAULT_SERVICE_MINUTES

    try:
        staff = int(on_duty_doctors)
    except (TypeError, ValueError, OverflowError):
        staff = 0
    staff = max(0, staff)

    workload_exists = bool(rows)
    if staff <= 0 and workload_exists:
        return {str(tier): None for tier in range(1, 5)}
    if not workload_exists:
        return {str(tier): 0 for tier in range(1, 5)}

    # Active consultations are already in service. Since exact remaining
    # duration isn't observable, reserve half a typical service duration each.
    consultation_load = sum(service_time * 0.5 for row in rows if row["status"] == "In-Consultation")
    waiting = [row for row in rows if row["status"] == "Waiting"]
    estimates: dict[str, int | None] = {}
    for target in range(1, 5):
        ahead_count = sum(1 for row in waiting if row["tier"] <= target)
        total_workload_minutes = consultation_load + ahead_count * service_time
        estimates[str(target)] = ceil((total_workload_minutes / staff) * BUFFER)
    return estimates


def estimate_metadata(
    service_sample_size: int,
    staffed_doctors: int,
    active_visit_count: int,
) -> dict[str, Any]:
    sample_size = max(0, int(service_sample_size or 0))
    if sample_size >= ROBUST_SAMPLES:
        quality = "OBSERVATION_BASED"
        basis = "median of recent completed operational consultation durations"
    elif sample_size >= MIN_SAMPLES_FOR_CALIBRATION:
        quality = "LIMITED_OBSERVATIONS"
        basis = "median of a small sample of completed operational consultation durations"
    else:
        quality = "DEFAULT_ASSUMPTION"
        basis = f"default {DEFAULT_SERVICE_MINUTES:g}-minute service-time assumption; fewer than {MIN_SAMPLES_FOR_CALIBRATION} eligible operational samples"
    unavailable = staffed_doctors <= 0 and active_visit_count > 0
    return {
        "model": "queue-workload-estimate",
        "model_version": "queue-workload-2.0.0",
        "estimate_quality": "UNAVAILABLE_NO_STAFF" if unavailable else quality,
        "service_time_basis": basis,
        "service_history_samples": sample_size,
        "staffed_doctors": max(0, int(staffed_doctors or 0)),
        "degraded": unavailable,
        "limitations": [
            "Estimates describe workload for a hypothetical new visit at each tier, not a guarantee for an individual patient.",
            "The model assumes work can be distributed across the reported staffed doctors.",
            "Each active consultation is assigned an assumed half-service-time remaining because exact remaining duration is not observable.",
            "Triage tier is assigned by authorised clinical staff; the estimate never changes clinical priority.",
        ],
    }
