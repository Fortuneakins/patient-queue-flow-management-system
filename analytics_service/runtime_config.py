from __future__ import annotations

from urllib.parse import urlparse

PROVENANCE_MODES = frozenset({"OPERATIONAL", "SYNTHETIC_TEST", "DEMO"})


def resolve_provenance_mode(node_env: str | None, configured_mode: str | None) -> str:
    environment = (node_env or "development").strip().lower()
    requested = (configured_mode or "").strip().upper()
    mode = requested or ("OPERATIONAL" if environment == "production" else "SYNTHETIC_TEST")
    if mode not in PROVENANCE_MODES:
        raise RuntimeError("DATA_PROVENANCE_MODE must be OPERATIONAL, SYNTHETIC_TEST or DEMO.")
    if environment == "production" and mode != "OPERATIONAL":
        raise RuntimeError("Production analytics must use DATA_PROVENANCE_MODE=OPERATIONAL.")
    return mode


def validate_production_config(
    *,
    node_env: str,
    mode: str,
    internal_token: str,
    database_url: str,
    database_password: str,
    sslmode: str,
    cors_origins: list[str],
) -> None:
    if (node_env or "").strip().lower() != "production":
        return
    if mode != "OPERATIONAL":
        raise RuntimeError("Production analytics must use DATA_PROVENANCE_MODE=OPERATIONAL.")
    if len((internal_token or "").strip()) < 32:
        raise RuntimeError("Production analytics requires an INTERNAL_SERVICE_TOKEN of at least 32 characters.")
    if not (database_url or "").strip() and not (database_password or "").strip():
        raise RuntimeError("Production analytics requires a database password or DATABASE_URL.")
    if (sslmode or "").strip().lower() not in {"require", "verify-ca", "verify-full"}:
        raise RuntimeError("Production analytics requires DB_SSLMODE=require, verify-ca or verify-full.")
    if not cors_origins or any(urlparse(origin).scheme != "https" for origin in cors_origins):
        raise RuntimeError("Production analytics CORS_ORIGIN must contain only HTTPS origins.")
