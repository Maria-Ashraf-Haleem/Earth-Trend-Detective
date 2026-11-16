"""Settings parsing for deployment-critical environment variables."""

from app.core.config import Settings


def test_cors_origins_default_allows_the_local_dev_server():
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ['http://localhost:5173', 'http://127.0.0.1:5173']


def test_cors_origins_accept_comma_separated_hosted_origins(monkeypatch):
    monkeypatch.setenv(
        'CORS_ORIGINS',
        'https://mohammed-emad2004.github.io, https://maria-ashraf-haleem.github.io',
    )
    settings = Settings(_env_file=None)
    assert settings.cors_origins == [
        'https://mohammed-emad2004.github.io',
        'https://maria-ashraf-haleem.github.io',
    ]


def test_cors_origins_accept_semicolons_and_drop_blanks(monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', 'https://a.example.io;;https://b.example.io; ')
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ['https://a.example.io', 'https://b.example.io']


def test_cors_origins_accept_json_array(monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', '["https://a.example.io"]')
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ['https://a.example.io']


def test_cors_origins_accept_wildcard_for_public_read_only_api(monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', '*')
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ['*']
