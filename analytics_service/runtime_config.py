from __future__ import annotations

from urllib.parse import urlparse, unquote
import re

PROVENANCE_MODES = frozenset({"OPERATIONAL", "SYNTHETIC_TEST", "DEMO"})


def is_placeholder_secret(value: str | None) -> bool:
    return bool(value and re.search(
        r"REPLACE[_ -]?WITH|GENERATED[_ -]?BY|PLACEHOLDER|YOUR[_ -]|CHANGE[_ -]?ME|EXAMPLE[_ -]?SECRET|CI[_ -]?SECRET",
        str(value),
        flags=re.IGNORECASE,
    ))


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
    sslmode: str,
    cors_origins: list[str],
    api_database_user: str = "",
    analytics_database_user: str = "",
    analytics_database_password: str = "",
    analytics_database_url: str = "",
) -> None:
    if (node_env or "").strip().lower() != "production":
        return
    if mode != "OPERATIONAL":
        raise RuntimeError("Production analytics must use DATA_PROVENANCE_MODE=OPERATIONAL.")
    if len((internal_token or "").strip()) < 32 or is_placeholder_secret(internal_token):
        raise RuntimeError("Production analytics requires a non-placeholder INTERNAL_SERVICE_TOKEN of at least 32 characters.")
    if (analytics_database_url or "").strip():
        parsed_database_url = urlparse(analytics_database_url.strip())
        if parsed_database_url.scheme not in {"postgres", "postgresql"} or not parsed_database_url.hostname:
            raise RuntimeError("ANALYTICS_DATABASE_URL must be a valid PostgreSQL URL.")
        analytics_url_user = unquote(parsed_database_url.username or "")
        if not analytics_url_user:
            raise RuntimeError("ANALYTICS_DATABASE_URL must identify a dedicated read-only analytics database user.")
        if analytics_url_user == (api_database_user or "").strip():
            raise RuntimeError("The analytics database user must differ from the API database user.")
        if is_placeholder_secret(unquote(parsed_database_url.password or "")):
            raise RuntimeError("ANALYTICS_DATABASE_URL must not contain placeholder credentials.")
    else:
        if not (analytics_database_password or "").strip():
            raise RuntimeError("Production analytics requires a dedicated analytics database password or ANALYTICS_DATABASE_URL.")
        if is_placeholder_secret(analytics_database_password):
            raise RuntimeError("Production analytics database password cannot be a placeholder secret.")
        if not (analytics_database_user or "").strip():
            raise RuntimeError("Production analytics requires a dedicated ANALYTICS_DB_USER.")
        if analytics_database_user.strip() == (api_database_user or "").strip():
            raise RuntimeError("The analytics database user must differ from the API database user.")
        if is_placeholder_secret(analytics_database_user):
            raise RuntimeError("Production analytics database username cannot be a placeholder.")
    if (sslmode or "").strip().lower() not in {"require", "verify-ca", "verify-full"}:
        raise RuntimeError("Production analytics requires DB_SSLMODE=require, verify-ca or verify-full.")
    if not cors_origins or any(urlparse(origin).scheme != "https" for origin in cors_origins):
        raise RuntimeError("Production analytics CORS_ORIGIN must contain only HTTPS origins.")
