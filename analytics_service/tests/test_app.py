from datetime import datetime, timezone

from analytics_service import app as analytics


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
    rows = [("Waiting", 4, datetime.now(timezone.utc), None, "OPERATIONAL")]
    cursor = FakeCursor(rows)
    monkeypatch.setattr(analytics, "_connect", lambda: FakeConnection(cursor))
    monkeypatch.setattr(analytics, "DATA_PROVENANCE_MODE", "OPERATIONAL")
    visits = analytics.db_rows()
    assert len(visits) == 1
    assert visits[0]["data_provenance"] == "OPERATIONAL"
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
        {"status": "Waiting", "priority_level": 4, "queued_at": datetime.now(timezone.utc), "called_at": None}
    ])
    monkeypatch.setattr(analytics, "on_duty_count", lambda: 1)
    monkeypatch.setattr(analytics, "service_time_samples", lambda: [12.0] * 35)
    response = analytics.app.test_client().get("/api/predict")
    assert response.status_code == 200
    assert response.json["degraded"] is False
    assert response.json["estimate_quality"] == "OBSERVATION_BASED"
    assert response.json["service_history_samples"] == 35
    assert response.json["service_time_basis"].startswith("median of recent operational call-to-discharge")
    assert response.json["4"] > 0


def test_predict_does_not_report_zero_wait_when_no_staff_are_available(monkeypatch):
    monkeypatch.setattr(analytics, "db_rows", lambda: [
        {"status": "Waiting", "priority_level": 4, "queued_at": datetime.now(timezone.utc), "called_at": None}
    ])
    monkeypatch.setattr(analytics, "on_duty_count", lambda: 0)
    monkeypatch.setattr(analytics, "service_time_samples", lambda: [12.0] * 35)
    response = analytics.app.test_client().get("/api/predict")
    assert response.status_code == 200
    assert response.json["degraded"] is True
    assert response.json["estimate_quality"] == "UNAVAILABLE_NO_STAFF"
    assert response.json["4"] is None


def test_predict_degrades_to_unavailable_not_zero_when_dependency_fails(monkeypatch):
    def fail():
        raise RuntimeError("underlying credentials must not be returned")
    monkeypatch.setattr(analytics, "db_rows", fail)
    response = analytics.app.test_client().get("/api/predict")
    assert response.status_code == 200
    assert response.json["degraded"] is True
    assert response.json["1"] is None
    assert "credentials" not in response.get_data(as_text=True)
