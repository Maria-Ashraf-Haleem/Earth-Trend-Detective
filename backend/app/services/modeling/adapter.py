"""Provider-agnostic inference adapter interface.

The adapter layer is the only place that knows how to talk to a model. Two
providers are prepared:

- ``http``: a model served by any internal/external HTTP service (university
  server, dedicated host, or managed provider) that accepts JSON features and
  returns a JSON prediction document.
- ``local``: a locally hosted Python model. It raises NotImplemented until a
  real artifact and loader exist; it never fabricates predictions.

If no model is configured, ``get_adapter`` returns None and routes answer with
an explicit not-configured status instead of generated data.
"""
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib import error as urlerror
from urllib import request as urlrequest

from app.services.modeling.config import ModelSettings, get_model_settings

logger = logging.getLogger('earthtrend.model')


@dataclass(frozen=True)
class PredictionFailure(Exception):
    code: str
    message: str
    retryable: bool = False

    def __str__(self) -> str:
        return f'{self.code}: {self.message}'


@dataclass(frozen=True)
class PredictionOutcome:
    value: float
    unit: str
    model_name: str
    model_version: str
    confidence: float | None = None
    extras: dict[str, Any] = field(default_factory=dict)


class InferenceAdapter(Protocol):
    name: str

    def availability(self) -> dict[str, Any]:
        """Return provider reachability and identity metadata."""

    def predict(self, features: dict[str, Any], request_id: str) -> PredictionOutcome:
        """Run one validated inference request. Must never invent values."""


class HttpModelAdapter:
    """POST the validated feature document to a configured HTTP endpoint."""

    name = 'http'

    def __init__(self, settings: ModelSettings):
        self._settings = settings

    def _headers(self) -> dict[str, str]:
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
        key = self._settings.model_api_key
        if key is not None:
            headers['Authorization'] = f'Bearer {key.get_secret_value()}'
        return headers

    def availability(self) -> dict[str, Any]:
        return {'provider': self.name, 'model_name': self._settings.model_name,
                'model_version': self._settings.model_version,
                'endpoint_configured': bool(self._settings.model_endpoint)}

    def predict(self, features: dict[str, Any], request_id: str) -> PredictionOutcome:
        payload = json.dumps({'request_id': request_id,
                              'model_name': self._settings.model_name,
                              'model_version': self._settings.model_version,
                              'features': features}, separators=(',', ':')).encode()
        request = urlrequest.Request(self._settings.model_endpoint, data=payload,
                                     headers=self._headers(), method='POST')
        try:
            with urlrequest.urlopen(request, timeout=self._settings.model_timeout_seconds) as response:
                body = response.read(1_048_576)
        except urlerror.HTTPError as exc:
            raise PredictionFailure('model_http_error', f'Inference service returned HTTP {exc.code}.',
                                    retryable=exc.code >= 500) from exc
        except urlerror.URLError as exc:
            raise PredictionFailure('model_unreachable', 'The inference service could not be reached.',
                                    retryable=True) from exc
        except TimeoutError as exc:
            raise PredictionFailure('model_timeout', 'The inference service did not answer in time.',
                                    retryable=True) from exc
        return parse_inference_document(body, self._settings)


class LocalModelAdapter:
    """Reserved for a future locally hosted artifact; disabled by default."""

    name = 'local'

    def __init__(self, settings: ModelSettings):
        self._settings = settings

    def availability(self) -> dict[str, Any]:
        return {'provider': self.name, 'model_name': self._settings.model_name,
                'model_version': self._settings.model_version,
                'artifact_available': False}

    def predict(self, features: dict[str, Any], request_id: str) -> PredictionOutcome:
        raise PredictionFailure('model_not_implemented',
                                'No local model artifact is installed. Predictions remain unavailable '
                                'until a trained artifact and loader are provided.')


def parse_inference_document(body: bytes, settings: ModelSettings) -> PredictionOutcome:
    """Validate the provider response shape; reject anything unparsable."""
    try:
        document = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise PredictionFailure('model_invalid_response', 'The inference service returned unreadable JSON.') from exc
    if not isinstance(document, dict):
        raise PredictionFailure('model_invalid_response', 'The inference response is not a JSON object.')
    value = document.get('value')
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PredictionFailure('model_invalid_response', 'The inference response has no numeric "value".')
    outcome = PredictionOutcome(
        value=float(value),
        unit=str(document.get('unit') or ''),
        model_name=str(document.get('model_name') or settings.model_name),
        model_version=str(document.get('model_version') or settings.model_version),
        confidence=document.get('confidence') if isinstance(document.get('confidence'), (int, float)) else None,
        extras={k: v for k, v in document.items() if k not in ('value', 'unit', 'model_name', 'model_version', 'confidence')},
    )
    return outcome


def get_adapter(settings: ModelSettings | None = None) -> InferenceAdapter | None:
    """Return the configured adapter, or None when models are disabled."""
    settings = settings or get_model_settings()
    if not settings.provider_configured():
        return None
    if settings.model_provider == 'http':
        if not settings.model_endpoint:
            return None
        return HttpModelAdapter(settings)
    if settings.model_provider == 'local':
        return LocalModelAdapter(settings)
    return None
