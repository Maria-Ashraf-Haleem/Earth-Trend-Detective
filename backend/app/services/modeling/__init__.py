"""Model integration: configuration, adapters and feature preparation.

This package contains no trained model and no generated predictions. It exists
so a future model can be connected through configuration only, without touching
the observed-data API contract.
"""
from app.services.modeling.adapter import (InferenceAdapter, LocalModelAdapter, HttpModelAdapter,
                                           PredictionFailure, PredictionOutcome, get_adapter,
                                           parse_inference_document)
from app.services.modeling.config import ModelSettings, get_model_settings
from app.services.modeling.features import (build_feature_document, dumps, fetch_feature_rows,
                                            summarize_features)

__all__ = ['InferenceAdapter', 'LocalModelAdapter', 'HttpModelAdapter', 'PredictionFailure',
           'PredictionOutcome', 'get_adapter', 'parse_inference_document', 'ModelSettings',
           'get_model_settings', 'build_feature_document', 'dumps', 'fetch_feature_rows',
           'summarize_features']
