from datetime import datetime, timezone

from analytics_service import app as analytics


def _test_service_headers(monkeypatch):
    token = "analytics-test-token-not-a-production-secret"
    monkeypatch.setattr(analytics, "INTERNAL_SERVICE_TOKEN", token)
    return {"X-Internal-Service-Token": token}


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.sql = ""

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, sql, _params=None):
        self.sql = sql

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return (1,)


class FakeConnection:
    def __init__(self, cursor):
        self.fake_cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self.fake_cursor


def test_live_endpoint_is_available_without_database():
    response = analytics.app.test_client().get("/api/health/live")
    assert response.status_code == 200
    assert response.json["status"] == "ok"
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_ready_endpoint_checks_database(monkeypatch):
    cursor = FakeCursor([])
    monkeypatch.setattr(analytics, "_connect", lambda: FakeConnection(cursor))
    response = analytics.app.test_client().get("/api/health/ready")
    assert response.status_code == 200
    assert response.json["database"] == "ok"


def test_ready_endpoint_reports_dependency_failure(monkeypatch):
    def fail():
        raise RuntimeError("db details must not be exposed")
    monkeypatch.setattr(analytics, "_connect", fail)
    response = analytics.app.test_client().get("/api/health/ready")
    assert response.status_code == 503
    assert response.json["status"] == "not-ready"
    assert "db details" not in response.get_data(as_text=True)


def test_db_rows_apply_configured_provenance_visibility(monkeypatch):
    rows = [("Waiting", 4, datetime.now(timezone.utc), None, "OPERATIONAL", 42)]
    cursor = FakeCursor(rows)
    monkeypatch.setattr(analytics, "_connect", lambda: FakeConnection(cursor))
    monkeypatch.setattr(analytics, "DATA_PROVENANCE_MODE", "OPERATIONAL")
    visits = analytics.db_rows()
    assert len(visits) == 1
    assert visits[0]["data_provenance"] == "OPERATIONAL"
    assert visits[0]["queue_id"] == 42
    # The SQL predicate must exclude synthetic/demo records in OPERATIONAL mode.
    assert "data_provenance NOT IN ('SYNTHETIC_TEST', 'DEMO')" in cursor.sql
    assert "LIMIT 1000" in cursor.sql


def test_provenance_visibility_uses_only_allow_listed_modes():
    assert "NOT IN ('SYNTHETIC_TEST', 'DEMO')" in analytics._provenance_visibility("OPERATIONAL")
    assert "data_provenance <> 'DEMO'" in analytics._provenance_visibility("SYNTHETIC_TEST")
    assert "data_provenance <> 'SYNTHETIC_TEST'" in analytics._provenance_visibility("DEMO")
    try:
        analytics._provenance_visibility("UNCLASSIFIED")
    except ValueError:
        pass
    else:
        raise AssertionError("unsupported provenance mode should be rejected")


def test_service_history_query_only_uses_operational_records(monkeypatch):
    cursor = FakeCursor([(12.5,), (18.0,)])
    monkeypatch.setattr(analytics, "_connect", lambda: FakeConnection(cursor))
    values = analytics.service_time_samples()
    assert values == [12.5, 18.0]
    assert "data_provenance = 'OPERATIONAL'" in cursor.sql
    assert "LIMIT 500" in cursor.sql


def test_predict_returns_transparent_metadata(monkeypatch):
    monkeypatch.setattr(analytics, "db_rows", lambda: [
        {"queue_id": 42, "status": "Waiting", "priority_level": 4, "queued_at": datetime.now(timezone.utc), "called_at": None}
    ])
    monkeypatch.setattr(analytics, "on_duty_count", lambda: 1)
    monkeypatch.setattr(analytics, "tier_service_time_samples", lambda: ([{"tier": 1, "service_minutes": 8.0}] * 8 + [{"tier": 2, "service_minutes": 10.0}] * 8 + [{"tier": 3, "service_minutes": 12.0}] * 8 + [{"tier": 4, "service_minutes": 14.0}] * 11))
    monkeypatch.setattr(analytics, "forecast_calibration_observations", lambda: [])
    response = analytics.app.test_client().get("/api/predict", headers=_test_service_headers(monkeypatch))
    assert response.status_code == 200
    assert response.json["degraded"] is False
    assert response.json["estimate_quality"] == "OBSERVATION_BASED"
    assert response.json["service_history_samples"] == 35
    assert "operational call-to-discharge intervals" in response.json["service_time_basis"]
    assert response.json["4"] > 0
    assert response.json["visit_estimates"] == [
        {"queue_id": 42, "tier": 4, "estimated_wait_minutes": 0}
    ]


def test_predict_does_not_report_zero_wait_when_no_staff_are_available(monkeypatch):
    monkeypatch.setattr(analytics, "db_rows", lambda: [
        {"status": "Waiting", "priority_level": 4, "queued_at": datetime.now(timezone.utc), "called_at": None}
    ])
    monkeypatch.setattr(analytics, "on_duty_count", lambda: 0)
    monkeypatch.setattr(analytics, "tier_service_time_samples", lambda: ([{"tier": 1, "service_minutes": 8.0}] * 8 + [{"tier": 2, "service_minutes": 10.0}] * 8 + [{"tier": 3, "service_minutes": 12.0}] * 8 + [{"tier": 4, "service_minutes": 14.0}] * 11))
    monkeypatch.setattr(analytics, "forecast_calibration_observations", lambda: [])
    response = analytics.app.test_client().get("/api/predict", headers=_test_service_headers(monkeypatch))
    assert response.status_code == 200
    assert response.json["degraded"] is True
    assert response.json["estimate_quality"] == "UNAVAILABLE_NO_STAFF"
    assert response.json["4"] is None


def test_predict_degrades_to_unavailable_not_zero_when_dependency_fails(monkeypatch):
    def fail():
        raise RuntimeError("underlying credentials must not be returned")
    monkeypatch.setattr(analytics, "db_rows", fail)
    response = analytics.app.test_client().get("/api/predict", headers=_test_service_headers(monkeypatch))
    assert response.status_code == 200
    assert response.json["degraded"] is True
    assert response.json["1"] is None
    assert "credentials" not in response.get_data(as_text=True)


def test_database_connections_are_read_only_and_time_bounded(monkeypatch):
    captured = {}

    def fake_connect(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(analytics.psycopg2, "connect", fake_connect)
    analytics._connect()

    options = captured["kwargs"]["options"]
    assert "default_transaction_read_only=on" in options
    assert "statement_timeout=10000" in options
    assert "idle_in_transaction_session_timeout=10000" in options
    assert captured["kwargs"]["connect_timeout"] == 3



def test_predict_rejects_missing_or_invalid_internal_service_token(monkeypatch):
    monkeypatch.setattr(analytics, "INTERNAL_SERVICE_TOKEN", "expected-internal-token")
    client = analytics.app.test_client()

    missing = client.get("/api/predict")
    invalid = client.get("/api/predict", headers={"X-Internal-Service-Token": "wrong-token"})

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert missing.json["error"] == "Authentication required."


def test_predict_fails_closed_if_internal_service_token_is_not_configured(monkeypatch):
    monkeypatch.setattr(analytics, "INTERNAL_SERVICE_TOKEN", "")

    response = analytics.app.test_client().get(
        "/api/predict",
        headers={"X-Internal-Service-Token": "unexpected-token"},
    )

    assert response.status_code == 503
    assert "not configured" in response.json["error"]



def test_tier_service_history_query_returns_tier_labelled_operational_samples(monkeypatch):
    cursor = FakeCursor([(1, 12.5), (4, 18.0)])
    monkeypatch.setattr(analytics, "_connect", lambda: FakeConnection(cursor))

    values = analytics.tier_service_time_samples()

    assert values == [
        {"tier": 1, "service_minutes": 12.5},
        {"tier": 4, "service_minutes": 18.0},
    ]
    assert "COALESCE(priority_level, 4)::int AS tier" in cursor.sql
    assert "data_provenance = 'OPERATIONAL'" in cursor.sql
    assert "INTERVAL '90 days'" in cursor.sql
    assert "LIMIT 500" in cursor.sql



def test_forecast_calibration_query_is_operational_and_horizon_bounded(monkeypatch):
    cursor = FakeCursor([(4, 12.0, 10.0)])
    monkeypatch.setattr(analytics, "_connect", lambda: FakeConnection(cursor))

    values = analytics.forecast_calibration_observations()

    assert values == [{"tier": 4, "predicted_wait_minutes": 12.0, "actual_wait_minutes": 10.0}]
    assert "flow_forecast_samples" in cursor.sql
    assert "flow_forecasts" in cursor.sql
    assert "data_provenance = 'OPERATIONAL'" in cursor.sql
    assert "flow_forecast_samples" in cursor.sql
    assert "f.model_version = 'queue-workload-3.2.0'" in cursor.sql
    assert "f.horizon_minutes" in cursor.sql
    assert "s.baseline_wait_minutes AS predicted_wait_minutes" in cursor.sql
    assert "ROW_NUMBER() OVER" in cursor.sql
