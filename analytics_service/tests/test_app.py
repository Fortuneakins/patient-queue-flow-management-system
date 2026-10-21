from datetime import datetime, timezone

import analytics_service.app as service


def _history(tier=4, service_minutes=10, wait_minutes=25, count=8):
    return [
        {"tier": tier, "service_minutes": service_minutes, "wait_minutes": wait_minutes}
        for _ in range(count)
    ]


def test_predict_keeps_legacy_tier_fields_and_exposes_model_evidence(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(
        service,
        "db_rows",
        lambda: [{"status": "Waiting", "priority_level": 4, "queued_at": now, "called_at": None}],
    )
    monkeypatch.setattr(service, "historical_rows", lambda: _history())
    monkeypatch.setattr(service, "staffing_profile", lambda: {"count": 1, "source": "SHIFT_SCHEDULE", "warning": None})

    response = service.app.test_client().get("/api/predict")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["degraded"] is False
    assert payload["4"] == 10
    assert payload["model"]["version"] == "pqfms-observed-queue-v2.0.0"
    assert payload["model"]["tiers"]["4"]["service_model"] == "TIER_HISTORY"
    assert payload["model"]["valid_service_samples"] == 8
    assert payload["model"]["staffing_source"] == "SHIFT_SCHEDULE"
    assert isinstance(payload["warnings"], list)


def test_predict_returns_degraded_not_false_zero_confidence_when_database_fails(monkeypatch):
    def raise_database_error():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(service, "db_rows", raise_database_error)

    response = service.app.test_client().get("/api/predict")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["degraded"] is True
    assert payload["1"] == payload["2"] == payload["3"] == payload["4"] == 0
    assert payload["model"]["method"] == "UNAVAILABLE"
    assert payload["warnings"]



def test_predict_explains_configured_staffing_fallback(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(service, "db_rows", lambda: [])
    monkeypatch.setattr(service, "historical_rows", lambda: [])
    monkeypatch.setattr(
        service,
        "staffing_profile",
        lambda: {
            "count": 2,
            "source": "CONFIGURED_FALLBACK",
            "warning": "The shift service could not verify staffing. The estimate uses the configured fallback of 2 staffed stations.",
        },
    )

    response = service.app.test_client().get("/api/predict")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["staffed_doctors"] == 2
    assert payload["model"]["staffing_source"] == "CONFIGURED_FALLBACK"
    assert any("could not verify staffing" in warning for warning in payload["warnings"])



def test_staffing_profile_discloses_unconfigured_internal_shift_token(monkeypatch):
    monkeypatch.setattr(service, "INTERNAL_SERVICE_TOKEN", "")
    monkeypatch.setattr(service, "STAFFED_STATIONS", 3)

    profile = service.staffing_profile()

    assert profile["count"] == 3
    assert profile["source"] == "CONFIGURED_FALLBACK"
    assert "not configured" in profile["warning"]


def test_staffing_profile_uses_verified_shift_schedule(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"on_duty": 4}

    monkeypatch.setattr(service, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    monkeypatch.setattr(service.requests, "get", lambda *args, **kwargs: FakeResponse())

    profile = service.staffing_profile()

    assert profile == {"count": 4, "source": "SHIFT_SCHEDULE", "warning": None}


def test_staffing_profile_falls_back_when_shift_service_returns_invalid_shape(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return []

    monkeypatch.setattr(service, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    monkeypatch.setattr(service, "STAFFED_STATIONS", 2)
    monkeypatch.setattr(service.requests, "get", lambda *args, **kwargs: FakeResponse())

    profile = service.staffing_profile()

    assert profile["count"] == 2
    assert profile["source"] == "CONFIGURED_FALLBACK"
    assert "could not provide a verified on-duty count" in profile["warning"]
    assert "configured fallback of 2 staffed station(s)" in profile["warning"]
