import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_jwt_secret_is_required_and_rejects_short_or_template_values(monkeypatch):
    monkeypatch.delenv("CIPHERA_JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, CIPHERA_JWT_SECRET="too-short")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, CIPHERA_JWT_SECRET="replace-with-a-random-64-character-hex-secret")


def test_valid_secret_is_redacted_and_has_a_stable_key_version():
    secret = "0123456789abcdef" * 4
    first = Settings(_env_file=None, CIPHERA_JWT_SECRET=secret)
    second = Settings(_env_file=None, CIPHERA_JWT_SECRET=secret)

    assert first.jwt_signing_secret == secret
    assert first.auth_key_version == second.auth_key_version
    assert secret not in repr(first)
