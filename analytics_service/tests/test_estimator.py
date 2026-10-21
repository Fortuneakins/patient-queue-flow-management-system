from datetime import datetime, timezone, timedelta

from analytics_service.estimator import (
    DEFAULT_SERVICE_MINUTES,
    MODEL_VERSION,
    estimate_waits,
    forecast_waits,
)


def _history(tier: int, service_minutes: float, wait_minutes: float, count: int = 8):
    return [
        {"tier": tier, "service_minutes": service_minutes, "wait_minutes": wait_minutes}
        for _ in range(count)
    ]


def test_empty_queue_has_zero_wait_for_every_tier():
    result = forecast_waits([], 1)
    assert result["estimates"] == {"1": 0, "2": 0, "3": 0, "4": 0}
    assert result["model"]["method"] == "TIER_ORDERED_QUEUE_SIMULATION"


def test_sparse_history_is_explicitly_reported_and_uses_safe_fallback():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"status": "Waiting", "priority_level": 2, "queued_at": now},
    ]

    result = forecast_waits(visits, 1, historical_observations=[], now=now)

    assert result["estimates"] == {"1": 0, "2": 12, "3": 12, "4": 12}
    assert result["model"]["version"] == MODEL_VERSION
    assert result["model"]["valid_service_samples"] == 0
    assert result["model"]["tiers"]["2"]["service_minutes_used"] == DEFAULT_SERVICE_MINUTES
    assert result["model"]["tiers"]["2"]["service_model"] == "DEFAULT_ASSUMPTION"
    assert any("12-minute fallback" in warning for warning in result["warnings"])


def test_tier_medians_drive_projection_when_enough_observations_exist():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    history = _history(1, 10, 18) + _history(2, 20, 32)
    visits = [
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=3)},
        {"status": "Waiting", "priority_level": 2, "queued_at": now - timedelta(minutes=2)},
    ]

    result = forecast_waits(visits, 1, historical_observations=history, now=now)

    assert result["estimates"] == {"1": 10, "2": 30, "3": 30, "4": 30}
    assert result["model"]["tiers"]["1"]["service_model"] == "TIER_HISTORY"
    assert result["model"]["tiers"]["1"]["service_minutes_used"] == 10
    assert result["model"]["tiers"]["1"]["tier_service_samples"] == 8
    assert result["model"]["tiers"]["2"]["historical_wait_median_minutes"] == 32
    assert result["model"]["tiers"]["2"]["historical_wait_samples"] == 8
    assert result["model"]["tiers"]["3"]["service_model"] == "GLOBAL_HISTORY"


def test_busy_doctor_remaining_time_uses_observed_residual_durations():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    history = _history(1, 20, 40)
    visits = [
        {
            "status": "In-Consultation",
            "priority_level": 1,
            "queued_at": now - timedelta(minutes=10),
            "called_at": now - timedelta(minutes=5),
        },
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=2)},
    ]

    result = forecast_waits(visits, 1, historical_observations=history, now=now)

    assert result["estimates"]["1"] == 35
    assert result["model"]["active_consultations"] == 1
    assert result["model"]["waiting_visits"] == 1


def test_priority_order_excludes_lower_priority_waiters_from_higher_tier_forecast():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"status": "Waiting", "priority_level": 4, "queued_at": now - timedelta(minutes=20)},
    ]

    result = forecast_waits(visits, 1, now=now)

    assert result["estimates"]["1"] == 0
    assert result["estimates"]["2"] == 0
    assert result["estimates"]["3"] == 0
    assert result["estimates"]["4"] == 12


def test_legacy_estimate_mapping_uses_the_same_evidence_aware_engine():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [{"status": "Waiting", "priority_level": 3, "queued_at": now}]

    assert estimate_waits(visits, 1, now) == {"1": 0, "2": 0, "3": 12, "4": 12}
