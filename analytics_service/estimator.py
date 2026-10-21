from __future__ import annotations

from datetime import datetime, timezone
from math import ceil
from statistics import median
from typing import Iterable

MODEL_VERSION = "pqfms-observed-queue-v2.0.0"
MIN_TIER_SERVICE_SAMPLES = 8
MIN_GLOBAL_SERVICE_SAMPLES = 8
DEFAULT_SERVICE_MINUTES = 12.0
MAX_SERVICE_MINUTES = 240.0
MAX_WAIT_MINUTES = 720.0


def _as_datetime(value: datetime | str | None) -> datetime | None:
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


def _number(value: object) -> float | None:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return result if result == result else None


def _profiles(observations: Iterable[dict]) -> tuple[dict[int, list[float]], dict[int, list[float]]]:
    service_by_tier: dict[int, list[float]] = {tier: [] for tier in range(1, 5)}
    wait_by_tier: dict[int, list[float]] = {tier: [] for tier in range(1, 5)}
    for item in observations or []:
        try:
            tier = int(item.get("tier") or 4)
        except (TypeError, ValueError):
            tier = 4
        tier = max(1, min(4, tier))
        service = _number(item.get("service_minutes"))
        waited = _number(item.get("wait_minutes"))
        if service is not None and 1 <= service <= MAX_SERVICE_MINUTES:
            service_by_tier[tier].append(service)
        if waited is not None and 0 <= waited <= MAX_WAIT_MINUTES:
            wait_by_tier[tier].append(waited)
    return service_by_tier, wait_by_tier


def _service_profile(service_by_tier: dict[int, list[float]]) -> tuple[dict[int, dict], list[float]]:
    all_service = [value for values in service_by_tier.values() for value in values]
    use_global = len(all_service) >= MIN_GLOBAL_SERVICE_SAMPLES
    global_median = median(all_service) if use_global else DEFAULT_SERVICE_MINUTES
    profile: dict[int, dict] = {}
    for tier in range(1, 5):
        values = service_by_tier[tier]
        if len(values) >= MIN_TIER_SERVICE_SAMPLES:
            profile[tier] = {
                "minutes": float(median(values)),
                "source": "TIER_HISTORY",
                "samples": len(values),
                "durations": values,
            }
        elif use_global:
            profile[tier] = {
                "minutes": float(global_median),
                "source": "GLOBAL_HISTORY",
                "samples": len(values),
                "durations": all_service,
            }
        else:
            profile[tier] = {
                "minutes": DEFAULT_SERVICE_MINUTES,
                "source": "DEFAULT_ASSUMPTION",
                "samples": len(values),
                "durations": [],
            }
    return profile, all_service


def _remaining_service(tier: int, elapsed: float | None, profile: dict[int, dict]) -> float:
    tier_profile = profile[tier]
    typical = float(tier_profile["minutes"])
    if elapsed is None:
        return typical
    durations = tier_profile["durations"]
    if len(durations) >= MIN_TIER_SERVICE_SAMPLES:
        residuals = [value - elapsed for value in durations if value > elapsed]
        if residuals:
            return max(1.0, float(median(residuals)))
        # A consultation that has exceeded all comparable completed durations is
        # not assumed to finish immediately; use the typical duration as a cautious fallback.
        return max(1.0, typical)
    return max(1.0, typical - elapsed) if elapsed < typical else max(1.0, typical)


def forecast_waits(
    visits: Iterable[dict],
    on_duty_doctors: int,
    historical_observations: Iterable[dict] | None = None,
    now: datetime | None = None,
) -> dict:
    """Estimate time until a new visit at each tier can be called.

    The estimate schedules the currently waiting workload in the same tier-first,
    then arrival-time order used by PQFMS. Completed consultation durations are
    learned from the last 90 days when enough valid observations exist. Sparse
    data falls back explicitly to a shared historical median or a 12-minute
    assumption; this is an operational estimate, not clinical advice.
    """
    current = _as_datetime(now) or datetime.now(timezone.utc)
    raw_visits = list(visits or [])
    service_by_tier, wait_by_tier = _profiles(historical_observations or [])
    profile, all_service = _service_profile(service_by_tier)

    waiting: list[dict] = []
    active: list[float] = []
    missing_call_times = 0
    for visit in raw_visits:
        status = visit.get("status")
        try:
            tier = int(visit.get("priority_level") or 4)
        except (TypeError, ValueError):
            tier = 4
        tier = max(1, min(4, tier))
        if status == "Waiting":
            queued_at = _as_datetime(visit.get("queued_at"))
            waiting.append({"tier": tier, "queued_at": queued_at})
        elif status == "In-Consultation":
            called_at = _as_datetime(visit.get("called_at"))
            if called_at is None:
                missing_call_times += 1
                elapsed = None
            else:
                elapsed = max(0.0, (current - called_at).total_seconds() / 60.0)
            active.append(_remaining_service(tier, elapsed, profile))

    waiting.sort(
        key=lambda row: (
            row["tier"],
            row["queued_at"] or datetime.min.replace(tzinfo=timezone.utc),
        )
    )
    staffing = max(1, int(on_duty_doctors or 0), len(active))

    def next_call_minutes(target_tier: int) -> int:
        # A newly arriving visit can be preceded by every current visit at the
        # same or a higher priority, but not by lower-priority waiting visits.
        available = list(active)
        available.extend([0.0] * max(0, staffing - len(available)))
        for row in waiting:
            if row["tier"] > target_tier:
                continue
            server = min(range(len(available)), key=available.__getitem__)
            available[server] += float(profile[row["tier"]]["minutes"])
        return max(0, int(ceil(min(available))))

    estimates = {str(tier): next_call_minutes(tier) for tier in range(1, 5)}
    tier_evidence = {}
    for tier in range(1, 5):
        service_values = service_by_tier[tier]
        wait_values = wait_by_tier[tier]
        tier_evidence[str(tier)] = {
            "estimated_wait_minutes": estimates[str(tier)],
            "service_minutes_used": round(float(profile[tier]["minutes"]), 1),
            "service_model": profile[tier]["source"],
            "tier_service_samples": len(service_values),
            "historical_wait_median_minutes": round(float(median(wait_values)), 1) if wait_values else None,
            "historical_wait_samples": len(wait_values),
        }

    warnings = []
    if len(all_service) < MIN_GLOBAL_SERVICE_SAMPLES:
        warnings.append(
            f"Only {len(all_service)} valid completed consultation durations are available; "
            f"the model uses the {DEFAULT_SERVICE_MINUTES:g}-minute fallback until enough observations accrue."
        )
    elif any(len(service_by_tier[tier]) < MIN_TIER_SERVICE_SAMPLES for tier in range(1, 5)):
        warnings.append(
            "At least one priority tier has fewer than "
            f"{MIN_TIER_SERVICE_SAMPLES} service observations; its estimate uses the pooled clinic median."
        )
    if missing_call_times:
        warnings.append(
            f"{missing_call_times} active consultation(s) lack a usable called_at timestamp; "
            "their remaining time uses the typical service duration."
        )
    warnings.append(
        "The projection schedules the queue currently recorded in PQFMS. It does not anticipate future arrivals, "
        "diagnose patients, validate clinical priority, or replace staff judgement."
    )

    return {
        "estimates": estimates,
        "model": {
            "version": MODEL_VERSION,
            "method": "TIER_ORDERED_QUEUE_SIMULATION",
            "historical_window_days": 90,
            "valid_service_samples": len(all_service),
            "valid_wait_samples": sum(len(values) for values in wait_by_tier.values()),
            "default_service_minutes": DEFAULT_SERVICE_MINUTES,
            "staff_slots_simulated": staffing,
            "active_consultations": len(active),
            "waiting_visits": len(waiting),
            "tiers": tier_evidence,
        },
        "warnings": warnings,
    }


def estimate_waits(
    visits: Iterable[dict],
    on_duty_doctors: int,
    now: datetime | None = None,
    historical_observations: Iterable[dict] | None = None,
) -> dict[str, int]:
    """Backwards-compatible estimate mapping used by callers and unit tests."""
    return forecast_waits(visits, on_duty_doctors, historical_observations, now)["estimates"]
