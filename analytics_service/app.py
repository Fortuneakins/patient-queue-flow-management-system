from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone

import psycopg2
import requests
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from .estimator import MODEL_VERSION, forecast_waits

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv()

app = Flask(__name__)
allowed_origins = [v.strip() for v in os.getenv("CORS_ORIGIN", "http://localhost:5173").split(",") if v.strip()]
CORS(app, origins=allowed_origins)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "pqfms_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}
NODE_SERVER_URL = os.getenv("NODE_SERVER_URL", "http://localhost:5000")
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "")
STAFFED_STATIONS = max(1, int(os.getenv("STAFFED_STATIONS", "1")))
HISTORY_DAYS = 90
MAX_HISTORY_ROWS = 5000


def db_rows() -> list[dict]:
    """Return only the live queue fields needed by the prediction engine."""
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status, COALESCE(priority_level, 4)::int, queued_at, called_at
                FROM queue_entries
                WHERE status IN ('Waiting', 'In-Consultation')
                ORDER BY COALESCE(priority_level, 4), queued_at
                LIMIT 1000
                """
            )
            return [
                {
                    "status": row[0],
                    "priority_level": row[1],
                    "queued_at": row[2].astimezone(timezone.utc) if row[2] and row[2].tzinfo else row[2],
                    "called_at": row[3].astimezone(timezone.utc) if row[3] and row[3].tzinfo else row[3],
                }
                for row in cur.fetchall()
            ]


def historical_rows() -> list[dict]:
    """Read de-identified timing observations; no patient identifiers are selected."""
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(priority_level, 4)::int AS tier,
                    EXTRACT(EPOCH FROM (called_at - queued_at)) / 60.0 AS wait_minutes,
                    EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0 AS service_minutes
                FROM queue_entries
                WHERE status = 'Discharged'
                  AND queued_at IS NOT NULL
                  AND called_at IS NOT NULL
                  AND discharged_at IS NOT NULL
                  AND called_at >= NOW() - (%s * INTERVAL '1 day')
                  AND called_at >= queued_at
                  AND discharged_at > called_at
                  AND EXTRACT(EPOCH FROM (called_at - queued_at)) / 60.0 BETWEEN 0 AND 720
                  AND EXTRACT(EPOCH FROM (discharged_at - called_at)) / 60.0 BETWEEN 1 AND 240
                ORDER BY called_at DESC
                LIMIT %s
                """,
                (HISTORY_DAYS, MAX_HISTORY_ROWS),
            )
            return [
                {
                    "tier": row[0],
                    "wait_minutes": float(row[1]),
                    "service_minutes": float(row[2]),
                }
                for row in cur.fetchall()
            ]


def on_duty_count() -> int:
    if not INTERNAL_SERVICE_TOKEN:
        return STAFFED_STATIONS
    response = requests.get(
        f"{NODE_SERVER_URL}/api/shifts/on-duty",
        headers={"X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN},
        timeout=2,
    )
    response.raise_for_status()
    value = int(response.json().get("on_duty", 0))
    return value if value > 0 else STAFFED_STATIONS


@app.get("/api/health/live")
def live():
    return jsonify({"status": "ok", "service": "pqfms-analytics", "timestamp": datetime.now(timezone.utc).isoformat()})


@app.get("/api/predict")
def predict():
    try:
        visits = db_rows()
        history = historical_rows()
        staff = on_duty_count()
        forecast = forecast_waits(visits, staff, historical_observations=history)
        return jsonify({
            **forecast["estimates"],
            "degraded": False,
            "staffed_doctors": staff,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": forecast["model"],
            "warnings": forecast["warnings"],
        })
    except Exception as exc:  # graceful degradation is a documented requirement
        app.logger.warning("Analytics unavailable: %s", exc)
        return jsonify({
            "1": 0, "2": 0, "3": 0, "4": 0,
            "degraded": True,
            "staffed_doctors": 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": {"version": MODEL_VERSION, "method": "UNAVAILABLE"},
            "warnings": ["Estimate unavailable because the analytics service could not read its required data."],
        }), 200


if __name__ == "__main__":
    port = int(os.getenv("ANALYTICS_PORT", "5001"))
    app.run(host="127.0.0.1", port=port, debug=False)
