from datetime import datetime, timezone, timedelta

from analytics_service.estimator import estimate_waits, estimate_metadata, calibrate_wait_estimates, estimate_current_visit_waits


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
    # Each waiting job is allocated to the currently earliest available doctor slot.
    # The active consultation has already consumed four of the 12 assumed minutes.
    assert estimate_waits(visits, 2, now) == {"1": 14, "2": 14, "3": 23, "4": 23}


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



def test_no_staff_reports_unavailable_even_when_queue_is_empty():
    assert estimate_waits([], 0) == {"1": None, "2": None, "3": None, "4": None}
    metadata = estimate_metadata(0, 0, 0)
    assert metadata["degraded"] is True
    assert metadata["estimate_quality"] == "UNAVAILABLE_NO_STAFF"


def test_historical_service_time_explicitly_describes_the_call_to_discharge_proxy():
    metadata = estimate_metadata(35, 2, 8)
    assert metadata["estimate_quality"] == "OBSERVATION_BASED"
    assert "call-to-discharge intervals" in metadata["service_time_basis"]
    assert any("post-consultation work" in item for item in metadata["limitations"])



def test_tier_specific_history_changes_service_time_for_each_priority():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    history = (
        [{"tier": 1, "service_minutes": 5} for _ in range(8)]
        + [{"tier": 2, "service_minutes": 10} for _ in range(8)]
        + [{"tier": 3, "service_minutes": 15} for _ in range(8)]
        + [{"tier": 4, "service_minutes": 20} for _ in range(8)]
    )
    visits = [
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=5)},
        {"status": "Waiting", "priority_level": 2, "queued_at": now - timedelta(minutes=4)},
        {"status": "Waiting", "priority_level": 3, "queued_at": now - timedelta(minutes=3)},
        {"status": "Waiting", "priority_level": 4, "queued_at": now - timedelta(minutes=2)},
    ]

    assert estimate_waits(visits, 1, now, service_minutes=history) == {
        "1": 6, "2": 18, "3": 35, "4": 58
    }


def test_elapsed_active_consultation_uses_conditional_remaining_duration():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    history = [
        {"tier": 1, "service_minutes": duration}
        for duration in [10, 12, 14, 16, 18, 20, 22, 24]
    ]
    visits = [
        {
            "status": "In-Consultation",
            "priority_level": 1,
            "queued_at": now - timedelta(minutes=20),
            "called_at": now - timedelta(minutes=10),
        },
        {"status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=2)},
    ]

    # Given an elapsed 10 minutes, comparable completed durations imply an
    # eight-minute median residual; one five-minute buffered job is not enough
    # to free the only slot before that existing job completes.
    assert estimate_waits(visits, 1, now, service_minutes=history)["1"] == 29


def test_insufficient_tier_history_uses_pooled_median_with_evidence_source():
    history = (
        [{"tier": 1, "service_minutes": 6} for _ in range(8)]
        + [{"tier": 2, "service_minutes": 18} for _ in range(4)]
    )
    metadata = estimate_metadata(history, 2, 1, active_consultation_count=0)

    assert metadata["tier_service_profiles"]["1"]["service_model"] == "TIER_HISTORY"
    assert metadata["tier_service_profiles"]["1"]["service_minutes"] == 6
    assert metadata["tier_service_profiles"]["2"]["service_model"] == "POOLED_HISTORY"
    assert metadata["tier_service_profiles"]["2"]["tier_service_samples"] == 4
    assert metadata["estimate_quality"] == "LIMITED_OBSERVATIONS"
    assert metadata["service_history_samples"] == 12
    assert metadata["projection_buffer_percent"] == 15
    assert any("not a calibrated prediction interval" in item for item in metadata["limitations"])


def test_service_metadata_reports_roster_mismatch_and_no_false_confidence():
    history = [{"tier": 4, "service_minutes": 14} for _ in range(8)]
    metadata = estimate_metadata(history, 1, 3, active_consultation_count=2)

    assert metadata["simulated_service_slots"] == 2
    assert metadata["active_consultations"] == 2
    assert metadata["waiting_visits"] == 1
    assert any("verify the roster" in warning for warning in metadata["warnings"])



def test_lower_priority_waiting_work_does_not_delay_a_higher_tier_forecast():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"status": "Waiting", "priority_level": 4, "queued_at": now - timedelta(minutes=45)},
    ]

    estimates = estimate_waits(visits, 1, now)

    assert estimates["1"] == 0
    assert estimates["2"] == 0
    assert estimates["3"] == 0
    assert estimates["4"] == 14



def test_current_visit_forecasts_are_individual_and_follow_priority_order():
    from analytics_service.estimator import estimate_current_visit_waits

    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"queue_id": 11, "status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=5)},
        {"queue_id": 12, "status": "Waiting", "priority_level": 1, "queued_at": now - timedelta(minutes=4)},
        {"queue_id": 13, "status": "Waiting", "priority_level": 2, "queued_at": now - timedelta(minutes=3)},
        {"queue_id": 14, "status": "Waiting", "priority_level": 4, "queued_at": now - timedelta(minutes=2)},
    ]

    forecasts = estimate_current_visit_waits(visits, 2, now)

    assert forecasts == [
        {"queue_id": 11, "tier": 1, "baseline_wait_minutes": 0, "calibration_offset_minutes": 0.0, "estimated_wait_minutes": 0},
        {"queue_id": 12, "tier": 1, "baseline_wait_minutes": 0, "calibration_offset_minutes": 0.0, "estimated_wait_minutes": 0},
        {"queue_id": 13, "tier": 2, "baseline_wait_minutes": 14, "calibration_offset_minutes": 0.0, "estimated_wait_minutes": 14},
        {"queue_id": 14, "tier": 4, "baseline_wait_minutes": 14, "calibration_offset_minutes": 0.0, "estimated_wait_minutes": 14},
    ]


def test_current_visit_forecasts_use_active_consultation_elapsed_time():
    from analytics_service.estimator import estimate_current_visit_waits

    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    history = [
        {"tier": 1, "service_minutes": duration}
        for duration in [10, 12, 14, 16, 18, 20, 22, 24]
    ]
    visits = [
        {"queue_id": 21, "status": "In-Consultation", "priority_level": 1,
         "queued_at": now - timedelta(minutes=20), "called_at": now - timedelta(minutes=10)},
        {"queue_id": 22, "status": "Waiting", "priority_level": 1,
         "queued_at": now - timedelta(minutes=2)},
    ]

    forecasts = estimate_current_visit_waits(visits, 1, now, service_minutes=history)

    assert forecasts == [{"queue_id": 22, "tier": 1, "baseline_wait_minutes": 10, "calibration_offset_minutes": 0.0, "estimated_wait_minutes": 10}]



def test_forecast_calibration_waits_for_minimum_sample_count():
    profile = calibrate_wait_estimates([
        {"tier": 4, "predicted_wait_minutes": 20, "actual_wait_minutes": 29}
        for _ in range(19)
    ])

    assert profile["global_samples"] == 19
    assert all(item["source"] == "NOT_CALIBRATED" for item in profile["tiers"].values())
    assert all(item["offset_minutes"] == 0 for item in profile["tiers"].values())


def test_forecast_calibration_uses_tier_median_and_caps_large_offsets():
    observations = (
        [{"tier": 1, "predicted_wait_minutes": 10, "actual_wait_minutes": 80} for _ in range(20)]
        + [{"tier": 4, "predicted_wait_minutes": 20, "actual_wait_minutes": 30} for _ in range(20)]
    )
    profile = calibrate_wait_estimates(observations)

    assert profile["global_samples"] == 40
    assert profile["tiers"]["1"]["source"] == "TIER_OPERATIONAL_TRUTH"
    assert profile["tiers"]["1"]["offset_minutes"] == 30
    assert profile["tiers"]["4"]["source"] == "TIER_OPERATIONAL_TRUTH"
    assert profile["tiers"]["4"]["offset_minutes"] == 10
    assert profile["tiers"]["2"]["source"] == "POOLED_OPERATIONAL_TRUTH"
    assert profile["tiers"]["2"]["offset_minutes"] == 30


def test_forecast_calibration_offset_is_applied_only_to_visit_level_forecast():
    now = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    visits = [
        {"queue_id": 91, "status": "Waiting", "priority_level": 1, "queued_at": now},
    ]
    calibration = {
        "tiers": {
            "1": {"source": "TIER_OPERATIONAL_TRUTH", "offset_minutes": 7.5}
        }
    }

    individual = estimate_current_visit_waits(visits, 1, now, calibration=calibration)

    assert individual == [{"queue_id": 91, "tier": 1, "baseline_wait_minutes": 0, "calibration_offset_minutes": 7.5, "estimated_wait_minutes": 8}]
    # Aggregate tier-level estimates remain transparent queue simulations and
    # are not silently adjusted using errors measured on individual visit samples.
    assert estimate_waits(visits, 1, now)["1"] == 14
