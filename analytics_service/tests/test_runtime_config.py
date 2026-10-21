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
        database_url="",
        database_password="a-db-password",
        sslmode="verify-full",
        cors_origins=["https://clinic.example.org"],
        api_database_user="pqfms_api",
        analytics_database_user="pqfms_analytics",
        analytics_database_password="read-only-db-secret",
    )
    cases = [
        {"internal_token": "short"},
        {"database_password": ""},
        {"analytics_database_password": ""},
        {"analytics_database_user": "pqfms_api"},
        {"sslmode": "disable"},
        {"cors_origins": ["http://clinic.example.org"]},
        {"cors_origins": []},
    ]
    for override in cases:
        kwargs = {
            "node_env": "production",
            "mode": "OPERATIONAL",
            "internal_token": "a" * 40,
            "database_url": "",
            "database_password": "a-db-password",
            "sslmode": "verify-full",
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
        database_url="",
        database_password="",
        sslmode="prefer",
        cors_origins=["http://localhost:5173"],
    )
