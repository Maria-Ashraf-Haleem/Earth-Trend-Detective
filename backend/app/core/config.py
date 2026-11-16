from functools import lru_cache
import json
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8-sig', extra='ignore')
    sql_server: str = 'localhost'
    sql_database: str = 'earthtrend_db'
    sql_driver: str = 'ODBC Driver 18 for SQL Server'
    sql_encrypt: bool = True
    sql_trust_server_certificate: bool = False
    sql_timeout: int = Field(default=10, ge=1, le=120)
    sql_query_timeout: int = Field(default=60, ge=1, le=600)
    pool_size: int = Field(default=5, ge=1, le=30)
    # NoDecode: comma-separated origins are standard in container env files and
    # platform variable editors; JSON arrays stay supported for typed settings.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ['http://localhost:5173', 'http://127.0.0.1:5173'])
    import_api_key: SecretStr | None = None
    data_file_path: Path = Path('data/earthtrend_spatial_fusion_v2.csv')
    audit_file_path: Path = Path('data/spatial_fusion_audit.json')
    import_batch_size: int = Field(default=2000, ge=100, le=20000)
    log_level: str = 'INFO'

    @field_validator('sql_database')
    @classmethod
    def safe_database_name(cls, value: str) -> str:
        if not value or len(value) > 128 or not all(c.isalnum() or c == '_' for c in value):
            raise ValueError('SQL_DATABASE must contain only letters, digits, and underscores')
        return value

    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        """Accept a JSON array, a comma/semicolon separated string, or '*' (any origin).

        Hosted deployments (Render, Railway, Fly.io, ...) set CORS_ORIGINS as a
        plain string; accepting both shapes keeps the same variable usable in a
        container env file and in a JSON-style platform setting.
        """
        if isinstance(value, str):
            text = value.strip()
            if text.startswith('['):
                try:
                    return json.loads(text)
                except json.JSONDecodeError as error:
                    raise ValueError(f'CORS_ORIGINS is not valid JSON and not a comma-separated list: {error}') from error
            if text in ('*', ''):
                return [text] if text else []
            return [origin.strip() for origin in text.replace(';', ',').split(',') if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
