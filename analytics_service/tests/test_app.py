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
    monkeypatch.setattr(service, "on_duty_count", lambda: 1)

    response = service.app.test_client().get("/api/predict")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["degraded"] is False
    assert payload["4"] == 10
    assert payload["model"]["version"] == "pqfms-observed-flow-v2.0.0"
    assert payload["model"]["tiers"]["4"]["service_model"] == "TIER_HISTORY"
    assert payload["model"]["valid_service_samples"] == 8
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
