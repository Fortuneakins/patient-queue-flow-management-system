from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse
import psycopg2
import requests
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from .estimator import estimate_waits, estimate_metadata
from .runtime_config import PROVENANCE_MODES, resolve_provenance_mode, validate_production_config

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv()

NODE_ENV = os.getenv("NODE_ENV", "development").strip().lower()
DATA_PROVENANCE_MODE = resolve_provenance_mode(NODE_ENV, os.getenv("DATA_PROVENANCE_MODE"))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
configured_origins = []
allowed_origins = []
for origin_value in os.getenv("CORS_ORIGIN", "http://localhost:5173").split(","):
    origin_value = origin_value.strip()
    if not origin_value:
        continue
    configured_origins.append(origin_value)
    parsed_origin = urlparse(origin_value)
    allowed_origins.append(f"{parsed_origin.scheme}://{parsed_origin.netloc}" if parsed_origin.scheme and parsed_origin.netloc else origin_value)
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "").strip()
DATABASE_URL = os.getenv("ANALYTICS_DATABASE_URL", "").strip()
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "pqfms_db"),
    "user": os.getenv("ANALYTICS_DB_USER") or os.getenv("DB_USER", "postgres"),
    "password": os.getenv("ANALYTICS_DB_PASSWORD") or os.getenv("DB_PASSWORD", ""),
}
API_DATABASE_USER = os.getenv("API_DATABASE_USER", os.getenv("DB_USER", "postgres"))
ANALYTICS_DATABASE_USER = os.getenv("ANALYTICS_DB_USER", "").strip()
ANALYTICS_DATABASE_PASSWORD = os.getenv("ANALYTICS_DB_PASSWORD", "").strip()
DB_SSLMODE = os.getenv("DB_SSLMODE", "verify-full" if NODE_ENV == "production" else "prefer").strip().lower()
NODE_SERVER_URL = os.getenv("NODE_SERVER_URL", "http://localhost:5000").rstrip("/")
STAFFED_STATIONS = max(1, int(os.getenv("STAFFED_STATIONS", "1")))

validate_production_config(
    node_env=NODE_ENV,
    mode=DATA_PROVENANCE_MODE,
    internal_token=INTERNAL_SERVICE_TOKEN,
    sslmode=DB_SSLMODE,
    cors_origins=configured_origins,
    api_database_user=API_DATABASE_USER,
    analytics_database_user=ANALYTICS_DATABASE_USER,
    analytics_database_password=ANALYTICS_DATABASE_PASSWORD,
    analytics_database_url=DATABASE_URL,
)

CORS(app, origins=allowed_origins)


def _connect():
    # The estimator is read-only by design. Keep the session read-only even if
    # a future configuration accidentally grants the analytics role extra SQL privileges.
    options = "-c default_transaction_read_only=on -c statement_timeout=10000 -c idle_in_transaction_session_timeout=10000"
    if DATABASE_URL:
        return psycopg2.connect(
            DATABASE_URL,
            connect_timeout=3,
            sslmode=DB_SSLMODE,
            options=options,
        )
    return psycopg2.connect(
        **DB_CONFIG,
        connect_timeout=3,
        sslmode=DB_SSLMODE,
        options=options,
    )


def _provenance_visibility(mode: str | None = None) -> str:
    """Return SQL from an allow-list, never from request input."""
    value = str(mode if mode is not None else DATA_PROVENANCE_MODE).strip().upper()
    if value not in PROVENANCE_MODES:
        raise ValueError("Unsupported data provenance mode.")
    if value == "OPERATIONAL":
        # Unclassified legacy visits stay visible to delay review; test/demo data do not.
        return "data_provenance NOT IN ('SYNTHETIC_TEST', 'DEMO')"
    if value == "SYNTHETIC_TEST":
        return "data_provenance <> 'DEMO'"
    return "data_provenance <> 'SYNTHETIC_TEST'"


def db_rows() -> list[dict]:
    visibility = _provenance_visibility()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT status, priority_level, queued_at, called_at, data_provenance
                FROM queue_entries
                WHERE status IN ('Waiting', 'In-Consultation')
                  AND {visibility}
                ORDER BY COALESCE(priority_level, 4), queued_at ASC
                LIMIT 1000
                """
            )
            return [
                {
                    "status": row[0],
                    "priority_level": row[1],
                    "queued_at": row[2].astimezone(timezone.utc) if row[2] else None,
                    "called_at": row[3].astimezone(timezone.utc) if row[3] else None,
                    "data_provenance": row[4],
                }
                for row in cur.fetchall()
            ]


def service_time_samples() -> list[float]:
    """Only explicitly operational records may calibrate the public estimate."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0 AS service_minutes
                FROM queue_entries
                WHERE status = 'Discharged'
                  AND data_provenance = 'OPERATIONAL'
                  AND called_at IS NOT NULL
                  AND discharged_at IS NOT NULL
                  AND discharged_at > called_at
                  AND discharged_at >= NOW() - INTERVAL '90 days'
                  AND EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0 BETWEEN 1 AND 240
                ORDER BY discharged_at DESC
                LIMIT 500
                """
            )
            return [float(row[0]) for row in cur.fetchall() if row[0] is not None]


def on_duty_count() -> int:
    if not INTERNAL_SERVICE_TOKEN:
        if NODE_ENV == "production":
            raise RuntimeError("Analytics-to-API internal authentication is not configured.")
        return STAFFED_STATIONS
    response = requests.get(
        f"{NODE_SERVER_URL}/api/shifts/on-duty",
        headers={"X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN},
        timeout=2,
    )
    response.raise_for_status()
    value = int(response.json().get("on_duty", 0))
    # A configured zero is a real operational constraint; do not silently invent staff.
    return max(0, value)


@app.after_request
def add_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/api/health/live")
def live():
    return jsonify({
        "status": "ok",
        "service": "pqfms-analytics",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/api/health/ready")
def ready():
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        if NODE_ENV == "production" and len(INTERNAL_SERVICE_TOKEN) < 32:
            raise RuntimeError("Internal API authentication is not configured.")
        return jsonify({
            "status": "ready",
            "service": "pqfms-analytics",
            "database": "ok",
            "provenance_mode": DATA_PROVENANCE_MODE,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        app.logger.warning("Analytics readiness check failed.")
        return jsonify({
            "status": "not-ready",
            "service": "pqfms-analytics",
            "database": "unavailable",
        }), 503


@app.get("/api/predict")
def predict():
    try:
        visits = db_rows()
        staff = on_duty_count()
        service_samples = service_time_samples()
        estimates = estimate_waits(visits, staff, service_minutes=service_samples)
        metadata = estimate_metadata(len(service_samples), staff, len(visits))
        return jsonify({
            **estimates,
            **metadata,
            "degraded": metadata["degraded"],
            "provenance_mode": DATA_PROVENANCE_MODE,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        # Do not report zero-minute waits when the analytics service is broken.
        app.logger.warning("Analytics estimate unavailable.", exc_info=True)
        return jsonify({
            "1": None, "2": None, "3": None, "4": None,
            "model": "queue-workload-estimate",
            "model_version": "queue-workload-2.0.0",
            "estimate_quality": "UNAVAILABLE",
            "degraded": True,
            "reason": "The live estimate could not be calculated. Queue operations continue normally.",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }), 200


if __name__ == "__main__":
    port = int(os.getenv("ANALYTICS_PORT", "5001"))
    app.run(host=os.getenv("ANALYTICS_BIND_HOST", "127.0.0.1"), port=port, debug=False)
