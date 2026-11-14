from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    cors_origins: list[str] = ['http://localhost:5173']
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
