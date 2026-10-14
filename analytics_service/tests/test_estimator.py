from datetime import datetime, timezone, timedelta

from analytics_service.estimator import estimate_waits


def test_empty_queue_is_zero():
    assert estimate_waits([], 1) == {"1": 0, "2": 0, "3": 0, "4": 0}


def test_worked_example():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=5)},
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=5)},
        {"status": "Waiting", "priority_level": 3, "queued_at": now - timedelta(minutes=10)},
        {"status": "In-Consultation", "priority_level": 2, "queued_at": now - timedelta(minutes=20)},
    ]
    assert estimate_waits(visits, 2, now) == {"1": 12, "2": 21, "3": 41, "4": 41}


def test_unassessed_waiting_is_treated_as_tier_four():
    now = datetime.now(timezone.utc)
    visits = [{"status": "Waiting", "priority_level": None, "queued_at": now}]
    values = estimate_waits(visits, 1, now)
    assert values["1"] == 0
    assert values["4"] == 69
