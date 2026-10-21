import pytest

from analytics_service.runtime_config import resolve_provenance_mode, validate_production_config


def test_non_production_defaults_to_synthetic_test():
    assert resolve_provenance_mode("development", None) == "SYNTHETIC_TEST"
    assert resolve_provenance_mode("test", "") == "SYNTHETIC_TEST"


def test_production_defaults_to_operational():
    assert resolve_provenance_mode("production", None) == "OPERATIONAL"


@pytest.mark.parametrize("mode", ["DEMO", "SYNTHETIC_TEST", "UNCLASSIFIED"])
def test_production_rejects_non_operational_or_invalid_modes(mode):
    with pytest.raises(RuntimeError):
        resolve_provenance_mode("production", mode)


def test_invalid_mode_is_rejected_in_every_environment():
    with pytest.raises(RuntimeError):
        resolve_provenance_mode("development", "UNCLASSIFIED")


def test_production_requires_strong_internal_token_database_password_ssl_and_https_cors():
    validate_production_config(
        node_env="production",
        mode="OPERATIONAL",
        internal_token="a" * 40,
        sslmode="verify-full",
        cors_origins=["https://clinic.example.org"],
        api_database_user="pqfms_api",
        analytics_database_user="pqfms_analytics",
        analytics_database_password="read-only-db-secret",
    )
    cases = [
        {"internal_token": "short"},
        {"analytics_database_password": ""},
        {"analytics_database_user": "pqfms_api"},
        {"sslmode": "disable"},
        {"cors_origins": ["http://clinic.example.org"]},
        {"cors_origins": ["https://clinic.example.org/admin"]},
        {"cors_origins": ["https://clinic.example.org/?unexpected=yes"]},
        {"cors_origins": ["https://clinic.example.org/#fragment"]},
        {"cors_origins": ["https://user:secret@clinic.example.org"]},
        {"cors_origins": ["https://localhost"]},
        {"cors_origins": []},
    ]
    for override in cases:
        kwargs = {
            "node_env": "production",
            "mode": "OPERATIONAL",
            "internal_token": "a" * 40,
            "sslmode": "verify-full",
            "api_database_user": "pqfms_api",
            "analytics_database_user": "pqfms_analytics",
            "analytics_database_password": "read-only-db-secret",
            "cors_origins": ["https://clinic.example.org"],
        }
        kwargs.update(override)
        with pytest.raises(RuntimeError):
            validate_production_config(**kwargs)


def test_development_does_not_require_production_secrets():
    validate_production_config(
        node_env="development",
        mode="SYNTHETIC_TEST",
        internal_token="",
        sslmode="prefer",
        cors_origins=["http://localhost:5173"],
    )



def test_analytics_database_url_must_be_a_valid_postgres_url(): 
    with pytest.raises(RuntimeError, match="valid PostgreSQL URL"):
        validate_production_config(
            node_env="production",
            mode="OPERATIONAL",
            internal_token="a" * 40,
            sslmode="verify-full",
            cors_origins=["https://clinic.example.org"],
            api_database_user="pqfms_api",
            analytics_database_url="https://pqfms_analytics:secret@db.example.org:5432/pqfms",
        )


def test_analytics_database_url_must_use_a_different_username():
    with pytest.raises(RuntimeError, match="differ from the API database user"):
        validate_production_config(
            node_env="production",
            mode="OPERATIONAL",
            internal_token="a" * 40,
            sslmode="verify-full",
            cors_origins=["https://clinic.example.org"],
            api_database_user="pqfms_api",
            analytics_database_url="postgresql://pqfms_api:secret@db.example.org:5432/pqfms",
        )


def test_dedicated_analytics_database_url_is_accepted():
    validate_production_config(
        node_env="production",
        mode="OPERATIONAL",
        internal_token="a" * 40,
        sslmode="verify-full",
        cors_origins=["https://clinic.example.org"],
        api_database_user="pqfms_api",
        analytics_database_url="postgresql://pqfms_analytics:secret@db.example.org:5432/pqfms",
    )



def test_production_rejects_placeholder_internal_and_database_secrets():
    with pytest.raises(RuntimeError, match="non-placeholder INTERNAL_SERVICE_TOKEN"):
        validate_production_config(
            node_env="production",
            mode="OPERATIONAL",
            internal_token="REPLACE_WITH_A_DIFFERENT_48_BYTE_RANDOM_SECRET",
            sslmode="verify-full",
            cors_origins=["https://clinic.example.org"],
            api_database_user="pqfms_api",
            analytics_database_user="pqfms_analytics",
            analytics_database_password="read-only-db-secret",
        )
    with pytest.raises(RuntimeError, match="cannot be a placeholder"):
        validate_production_config(
            node_env="production",
            mode="OPERATIONAL",
            internal_token="a" * 40,
            sslmode="verify-full",
            cors_origins=["https://clinic.example.org"],
            api_database_user="pqfms_api",
            analytics_database_user="pqfms_analytics",
            analytics_database_password="REPLACE_WITH_READ_ONLY_ANALYTICS_DATABASE_SECRET",
        )



def test_analytics_database_url_rejects_password_placeholder_and_disabled_tls():
    with pytest.raises(RuntimeError, match="placeholder credentials"):
        validate_production_config(
            node_env="production",
            mode="OPERATIONAL",
            internal_token="a" * 40,
            sslmode="verify-full",
            cors_origins=["https://clinic.example.org"],
            api_database_user="pqfms_api",
            analytics_database_url="postgresql://pqfms_analytics:REPLACE_WITH_SECRET@db.example.org:5432/pqfms",
        )
    with pytest.raises(RuntimeError, match="cannot disable or weaken PostgreSQL TLS"):
        validate_production_config(
            node_env="production",
            mode="OPERATIONAL",
            internal_token="a" * 40,
            sslmode="verify-full",
            cors_origins=["https://clinic.example.org"],
            api_database_user="pqfms_api",
            analytics_database_url="postgresql://pqfms_analytics:real-password@db.example.org:5432/pqfms?sslmode=disable",
        )
