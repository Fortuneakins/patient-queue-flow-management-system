from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone

import psycopg2
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from .estimator import estimate_waits

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


def db_rows() -> list[dict]:
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status, priority_level, queued_at
                FROM queue_entries
                WHERE status IN ('Waiting', 'In-Consultation')
                ORDER BY queued_at ASC
                """
            )
            return [
                {"status": row[0], "priority_level": row[1], "queued_at": row[2].astimezone(timezone.utc)}
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
        staff = on_duty_count()
        return jsonify({
            **estimate_waits(visits, staff),
            "degraded": False,
            "staffed_doctors": staff,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # graceful degradation is a documented requirement
        app.logger.warning("Analytics unavailable: %s", exc)
        return jsonify({
            "1": 0, "2": 0, "3": 0, "4": 0,
            "degraded": True,
            "staffed_doctors": 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }), 200


if __name__ == "__main__":
    port = int(os.getenv("ANALYTICS_PORT", "5001"))
    app.run(host="127.0.0.1", port=port, debug=False)