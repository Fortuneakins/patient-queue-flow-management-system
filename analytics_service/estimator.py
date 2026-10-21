from __future__ import annotations

from datetime import datetime, timezone
from math import ceil
from statistics import median
from typing import Any, Iterable

DEFAULT_SERVICE_MINUTES = 12.0
BUFFER = 1.15
MIN_SAMPLES_FOR_CALIBRATION = 5
MIN_TIER_SAMPLES = 8
ROBUST_SAMPLES = 30
MAX_VALID_SERVICE_MINUTES = 240.0
MAX_VALID_WAIT_MINUTES = 720.0


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
    return value.astimezone(timezone.utc)


def _valid_tier(value: Any) -> int:
    try:
        tier = int(value or 4)
    except (TypeError, ValueError, OverflowError):
        return 4
    return tier if 1 <= tier <= 4 else 4


def _normalise_service_samples(samples: Iterable[Any] | None) -> tuple[list[float], dict[int, list[float]]]:
    pooled: list[float] = []
    by_tier: dict[int, list[float]] = {tier: [] for tier in range(1, 5)}
    for item in samples or []:
        tier: int | None = None
        raw_duration: Any = item
        if isinstance(item, dict):
            raw_duration = item.get("service_minutes", item.get("minutes"))
            if item.get("tier") is not None:
                tier = _valid_tier(item.get("tier"))
        try:
            duration = float(raw_duration)
        except (TypeError, ValueError, OverflowError):
            continue
        if not 1 <= duration <= MAX_VALID_SERVICE_MINUTES:
            continue
        pooled.append(duration)
        if tier is not None:
            by_tier[tier].append(duration)
    # Keep the same bounded evidence window as the read-only analytics query.
    pooled = pooled[:500]
    for tier in range(1, 5):
        by_tier[tier] = by_tier[tier][:500]
    return pooled, by_tier


def _service_profiles(samples: Iterable[Any] | None) -> tuple[dict[int, dict[str, Any]], int, dict[int, list[float]]]:
    pooled, by_tier = _normalise_service_samples(samples)
    pooled_ready = len(pooled) >= MIN_SAMPLES_FOR_CALIBRATION
    pooled_median = float(median(pooled)) if pooled_ready else DEFAULT_SERVICE_MINUTES
    profiles: dict[int, dict[str, Any]] = {}

    for tier in range(1, 5):
        own = by_tier[tier]
        if len(own) >= MIN_TIER_SAMPLES:
            profiles[tier] = {
                "minutes": float(median(own)),
                "source": "TIER_HISTORY",
                "samples": len(own),
                "durations": own,
            }
        elif pooled_ready:
            profiles[tier] = {
                "minutes": pooled_median,
                "source": "POOLED_HISTORY",
                "samples": len(own),
                "durations": pooled,
            }
        else:
            profiles[tier] = {
                "minutes": DEFAULT_SERVICE_MINUTES,
                "source": "DEFAULT_ASSUMPTION",
                "samples": len(own),
                "durations": [],
            }
    return profiles, len(pooled), by_tier


def _remaining_service_minutes(row: dict[str, Any], profile: dict[str, Any], now: datetime) -> float:
    typical = float(profile["minutes"])
    called_at = row.get("called_at")
    if called_at is None:
        return typical

    elapsed = max(0.0, (now - called_at).total_seconds() / 60.0)
    durations = profile["durations"]
    if profile["source"] in {"TIER_HISTORY", "POOLED_HISTORY"} and len(durations) >= MIN_SAMPLES_FOR_CALIBRATION:
        residuals = [duration - elapsed for duration in durations if duration > elapsed]
        if len(residuals) >= 3:
            return max(1.0, float(median(residuals)))
        # The current service has exceeded almost all comparable completed
        # durations. Do not assume it is about to finish; retain a bounded,
        # conservative residual so the display cannot collapse to zero.
        return max(1.0, min(typical, typical * 0.5))

    # With insufficient history, use elapsed time against the explicit
    # assumption. A service that exceeds that assumption keeps a conservative
    # half-duration estimate, which is surfaced as a limitation.
    if elapsed < typical:
        return max(1.0, typical - elapsed)
    return max(1.0, typical * 0.5)


def estimate_waits(
    visits: Iterable[dict],
    on_duty_doctors: int,
    now: datetime | None = None,
    service_minutes: Iterable[Any] | None = None,
) -> dict[str, int | None]:
    """
    Estimate workload until a hypothetical new visit at each clinician-assigned tier.

    Current higher/equal-priority waiters are assigned to the earliest available
    doctor slot in priority/arrival order. Active consultations occupy slots using
    elapsed-service-aware residuals estimated from completed service-time history.
    Historical call-to-discharge durations are a proxy for slot occupancy; the
    result is a planning estimate, not an individual guarantee or triage decision.
    """
    current = _parse_datetime(now) or datetime.now(timezone.utc)
    rows: list[dict[str, Any]] = []
    for item in visits or []:
        if not isinstance(item, dict):
            continue
        status = item.get("status")
        if status not in {"Waiting", "In-Consultation"}:
            continue
        rows.append({
            "tier": _valid_tier(item.get("priority_level")),
            "status": status,
            "queued_at": _parse_datetime(item.get("queued_at")) or current,
            "called_at": _parse_datetime(item.get("called_at")),
        })

    profiles, _sample_size, _by_tier = _service_profiles(service_minutes)
    try:
        staff = int(on_duty_doctors)
    except (TypeError, ValueError, OverflowError):
        staff = 0
    staff = max(0, staff)

    if staff <= 0:
        # Unknown/zero staffing is not equivalent to a zero-minute wait,
        # even when the queue happens to be empty at the instant of the read.
        return {str(tier): None for tier in range(1, 5)}
    if not rows:
        return {str(tier): 0 for tier in range(1, 5)}

    active = [row for row in rows if row["status"] == "In-Consultation"]
    waiting = sorted(
        (row for row in rows if row["status"] == "Waiting"),
        key=lambda row: (row["tier"], row["queued_at"]),
    )

    # A stale roster must not make already-active service disappear. Infer the
    # minimum number of currently occupied slots, but metadata reports mismatch.
    simulated_slots = max(staff, len(active))
    active_loads = [
        _remaining_service_minutes(row, profiles[row["tier"]], current)
        for row in active
    ]
    while len(active_loads) < simulated_slots:
        active_loads.append(0.0)

    estimates: dict[str, int | None] = {}
    for target in range(1, 5):
        availability = active_loads.copy()
        for row in waiting:
            if row["tier"] > target:
                # Lower-priority records are not scheduled ahead of this target.
                continue
            slot = min(range(len(availability)), key=availability.__getitem__)
            availability[slot] += float(profiles[row["tier"]]["minutes"])
        minutes_until_available = min(availability) if availability else 0.0
        estimates[str(target)] = int(ceil(minutes_until_available * BUFFER))

    return estimates


def estimate_metadata(
    service_sample_size: int | Iterable[Any],
    staffed_doctors: int,
    active_visit_count: int,
    active_consultation_count: int | None = None,
) -> dict[str, Any]:
    """
    Create an explainable model summary.

    A numeric sample count remains accepted for compatibility with callers/tests
    that only have aggregate counts. The live analytics path supplies records so
    the response can distinguish tier-specific evidence from pooled evidence.
    """
    is_count_only = isinstance(service_sample_size, (int, float))
    if is_count_only:
        sample_count = max(0, int(service_sample_size or 0))
        profiles, _count, by_tier = _service_profiles([])
    else:
        profiles, sample_count, by_tier = _service_profiles(service_sample_size)  # type: ignore[arg-type]

    all_tiers_specific = all(profiles[tier]["source"] == "TIER_HISTORY" for tier in range(1, 5))
    if sample_count >= ROBUST_SAMPLES and (all_tiers_specific or is_count_only):
        quality = "OBSERVATION_BASED"
        basis = "median of recent operational call-to-discharge intervals; tier-specific medians used where sample requirements are met"
    elif sample_count >= MIN_SAMPLES_FOR_CALIBRATION:
        quality = "LIMITED_OBSERVATIONS"
        basis = "recent operational call-to-discharge intervals; some tiers use pooled rather than tier-specific medians"
    else:
        quality = "DEFAULT_ASSUMPTION"
        basis = f"default {DEFAULT_SERVICE_MINUTES:g}-minute service-time assumption; fewer than {MIN_SAMPLES_FOR_CALIBRATION} eligible operational samples"

    try:
        staff = max(0, int(staffed_doctors or 0))
    except (TypeError, ValueError, OverflowError):
        staff = 0
    try:
        active_count = max(0, int(active_visit_count or 0))
    except (TypeError, ValueError, OverflowError):
        active_count = 0
    if active_consultation_count is None:
        active_consultations = active_count
        waiting_count = 0
    else:
        try:
            active_consultations = max(0, int(active_consultation_count or 0))
        except (TypeError, ValueError, OverflowError):
            active_consultations = 0
        waiting_count = max(0, active_count - active_consultations)

    unavailable = staff <= 0
    warnings: list[str] = []
    if sample_count < MIN_SAMPLES_FOR_CALIBRATION:
        warnings.append(
            f"Only {sample_count} valid operational service-time sample(s) are available; "
            f"the estimator uses the {DEFAULT_SERVICE_MINUTES:g}-minute assumption."
        )
    elif not all_tiers_specific:
        warnings.append(
            f"At least one tier has fewer than {MIN_TIER_SAMPLES} tier-specific samples; "
            "that tier uses the pooled clinic median."
        )
    if active_consultation_count is not None and active_consultations > staff > 0:
        warnings.append(
            f"{active_consultations} consultations are active while the roster reports {staff} on-duty doctor(s). "
            "The workload simulation reserves a slot for each recorded active consultation; verify the roster."
        )
    if unavailable:
        warnings.append("No on-duty doctor could be verified. Wait estimates are unavailable rather than zero.")
    warnings.append(
        "This projection schedules the currently recorded queue only. It does not anticipate future arrivals, "
        "diagnose patients, validate clinical priority or replace staff judgement."
    )

    tier_metadata = {}
    for tier in range(1, 5):
        profile = profiles[tier]
        tier_metadata[str(tier)] = {
            "service_minutes": round(float(profile["minutes"]), 1),
            "service_model": profile["source"],
            "tier_service_samples": int(profile["samples"]),
            "pooled_service_samples": sample_count,
        }

    return {
        "model": "queue-workload-estimate",
        "model_version": "queue-workload-3.0.0",
        "estimate_quality": "UNAVAILABLE_NO_STAFF" if unavailable else quality,
        "service_time_basis": basis,
        "service_history_samples": sample_count,
        "service_time_minimum_calibration_samples": MIN_SAMPLES_FOR_CALIBRATION,
        "tier_service_minimum_samples": MIN_TIER_SAMPLES,
        "tier_service_profiles": tier_metadata,
        "staffed_doctors": staff,
        "simulated_service_slots": max(staff, active_consultations),
        "active_consultations": active_consultations,
        "waiting_visits": waiting_count,
        "degraded": unavailable,
        "warnings": warnings,
        "limitations": [
            "Estimates describe workload for a hypothetical new visit at each clinician-assigned tier, not an individual guarantee.",
            "The model simulates higher/equal-priority waiting visits across available doctor slots in tier and arrival order.",
            "Historical service time is measured from first doctor call to recorded discharge, so it can include post-consultation work and is a proxy rather than pure face-to-face consultation time.",
            "Active consultations use elapsed time and conditional residuals from comparable completed durations where enough history exists; sparse history uses an explicit bounded fallback.",
            "Tier-specific medians require at least eight valid completed visits in that tier; thinner tiers use the pooled median when available, otherwise the default assumption.",
            "The estimator does not predict future arrivals, diagnose patients or change the priority assigned by authorised clinical staff.",
        ],
    }
