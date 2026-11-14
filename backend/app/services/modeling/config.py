"""Optional model-integration configuration.

Nothing here assumes a trained model exists. MODEL_ENABLED must be explicitly
true and a provider must be named before the API exposes any inference route.
Keys stay on the backend; MODEL_API_KEY is a SecretStr and is never serialized.
"""
from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ModelSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8-sig', extra='ignore')
    model_enabled: bool = False
    model_provider: str = ''
    model_name: str = ''
    model_version: str = ''
    model_endpoint: str = ''
    model_api_key: SecretStr | None = None
    model_timeout_seconds: int = Field(default=60, ge=1, le=600)
    model_feature_version: str = 'ml_features_v1'

    @field_validator('model_provider', 'model_name', 'model_version', 'model_endpoint')
    @classmethod
    def strip_blank(cls, value: str) -> str:
        return value.strip()

    @field_validator('model_endpoint')
    @classmethod
    def http_endpoint_only(cls, value: str) -> str:
        if value and not (value.startswith('http://') or value.startswith('https://')):
            raise ValueError('MODEL_ENDPOINT must be an http(s) URL')
        return value

    def provider_configured(self) -> bool:
        return self.model_enabled and self.model_provider != ''


@lru_cache
def get_model_settings() -> ModelSettings:
    return ModelSettings()
