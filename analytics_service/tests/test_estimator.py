from datetime import datetime, timezone, timedelta

from analytics_service.estimator import estimate_waits, estimate_metadata


def test_empty_queue_reports_zero_for_each_tier():
    assert estimate_waits([], 1) == {"1": 0, "2": 0, "3": 0, "4": 0}


def test_workload_estimate_counts_equal_or_higher_priority_work_and_active_consultations():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=5)},
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=5)},
        {"status": "Waiting", "priority_level": 3, "queued_at": now - timedelta(minutes=10)},
        {"status": "In-Consultation", "priority_level": 2, "queued_at": now - timedelta(minutes=20), "called_at": now - timedelta(minutes=4)},
    ]
    # Three waiting jobs plus a conservative half-service allowance for the active consultation.
    assert estimate_waits(visits, 2, now) == {"1": 18, "2": 18, "3": 25, "4": 25}


def test_observed_service_time_is_used_only_after_minimum_sample_threshold():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"status": "Waiting", "priority_level": 1, "queued_at": now},
        {"status": "Waiting", "priority_level": 4, "queued_at": now},
    ]
    # Five eligible samples use the observed median (10 min) rather than the 12 min default.
    assert estimate_waits(visits, 1, now, service_minutes=[8, 10, 12, 10, 14]) == {
        "1": 12, "2": 12, "3": 12, "4": 23
    }


def test_no_staff_does_not_claim_a_wait_time_when_work_is_active():
    now = datetime.now(timezone.utc)
    visits = [{"status": "Waiting", "priority_level": 4, "queued_at": now}]
    assert estimate_waits(visits, 0, now) == {"1": None, "2": None, "3": None, "4": None}


def test_unknown_tier_falls_back_to_routine_without_crashing():
    now = datetime.now(timezone.utc)
    visits = [{"status": "Waiting", "priority_level": None, "queued_at": now}]
    values = estimate_waits(visits, 1, now)
    assert values["1"] == 0
    assert values["4"] == 14


def test_bad_timestamps_and_unusable_service_samples_do_not_crash_estimator():
    visits = [
        {"status": "Waiting", "priority_level": 2, "queued_at": "not-a-timestamp"},
        {"status": "Discharged", "priority_level": 1, "queued_at": datetime.now(timezone.utc)},
    ]
    values = estimate_waits(visits, 1, service_minutes=[None, "bad", 0, 900])
    assert values["2"] == 14
    assert values["4"] == 14


def test_estimate_quality_discloses_sample_size_and_no_staff_state():
    low = estimate_metadata(2, 1, 4)
    assert low["estimate_quality"] == "DEFAULT_ASSUMPTION"
    assert low["service_history_samples"] == 2
    robust = estimate_metadata(40, 2, 4)
    assert robust["estimate_quality"] == "OBSERVATION_BASED"
    no_staff = estimate_metadata(40, 0, 4)
    assert no_staff["estimate_quality"] == "UNAVAILABLE_NO_STAFF"
    assert no_staff["degraded"] is True
