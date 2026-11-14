"""Published versions require current certificates; preview is an explicit capability."""
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.models import Dataset, DatasetVersion, ImportJob, utcnow
from app.repositories import active_version, is_certified_version, latest_certified_version
from app.services.ingestion.validation import VALIDATION_POLICY_VERSION


def _proof(**changes):
    return {'reconciled': True, 'validation_policy': VALIDATION_POLICY_VERSION, **changes}


def _version(session, *, proof=None, dated=True, dataset_id='earthtrend-spatial-fusion-v2'):
    version = DatasetVersion(
        dataset_id=dataset_id, sha256=uuid4().hex * 2,
        source_size=0, audit_json={'synthetic_rollback_fixture': True},
        validation_json=_proof() if proof is None else proof,
        validated_at=utcnow() if dated else None,
    )
    session.add(version)
    session.flush()
    return version


@pytest.mark.parametrize('proof,dated,expected', [
    (_proof(), True, True),
    (_proof(), False, False),
    (_proof(reconciled=False), True, False),
    (_proof(reconciled='true'), True, False),
    (_proof(reconciled='false'), True, False),
    (_proof(reconciled=1), True, False),
    (_proof(validation_policy='retired-policy'), True, False),
    ({}, True, False),
    (['not an object certificate'], True, False),
])
def test_certificate_boolean_policy_and_timestamp_are_strict(proof, dated, expected):
    candidate = SimpleNamespace(validation_json=proof, validated_at=utcnow() if dated else None)
    assert is_certified_version(candidate) is expected


def test_missing_certificate_candidate_is_not_published():
    assert is_certified_version(None) is False


def test_default_without_a_certificate_returns_an_explicit_unavailable_state():
    class EmptyMetadataSession:
        def scalars(self, statement):
            return iter(())

    with pytest.raises(HTTPException) as failure:
        active_version(EmptyMetadataSession())
    assert failure.value.status_code == 503
    assert failure.value.detail == 'No certified dataset version is available'


def test_preview_requires_an_explicit_version_before_any_query():
    with pytest.raises(HTTPException) as failure:
        active_version(object(), allow_uncertified=True)
    assert failure.value.status_code == 422


def test_optional_catalog_lookup_can_return_an_explicit_missing_version():
    class EmptyMetadataSession:
        def scalars(self, statement):
            return iter(())

    assert latest_certified_version(EmptyMetadataSession()) is None


@pytest.mark.integration
def test_default_ignores_newer_populated_uncertified_version(sql_session):
    published = _version(sql_session)
    unverified = _version(sql_session, proof={}, dated=False)
    sql_session.add(ImportJob(id=str(uuid4()), dataset_version_id=unverified.id, status='completed',
                             processed_rows=5, inserted_rows=5, checkpoint_row=5))
    sql_session.flush()
    assert unverified.id > published.id
    assert active_version(sql_session) == published.id


@pytest.mark.integration
def test_current_certificate_remains_authoritative_despite_old_failed_import(sql_session):
    published = _version(sql_session)
    sql_session.add(ImportJob(id=str(uuid4()), dataset_version_id=published.id, status='failed',
                             error_code='VALIDATION_POLICY_UPDATED'))
    sql_session.flush()
    assert active_version(sql_session, published.id) == published.id
    assert active_version(sql_session) == published.id


@pytest.mark.integration
def test_catalog_selection_is_scoped_to_the_requested_logical_dataset(sql_session):
    published = _version(sql_session)
    other_dataset = Dataset(id=f'publication-{uuid4().hex}', name='Synthetic rollback catalog',
                            description='An independent fixture dataset, not source observations.')
    sql_session.add(other_dataset)
    sql_session.flush()
    other = _version(sql_session, dataset_id=other_dataset.id)
    assert other.id > published.id
    assert latest_certified_version(sql_session, other_dataset.id).id == other.id
    assert active_version(sql_session) == published.id
    assert latest_certified_version(sql_session, f'empty-{uuid4().hex}') is None


@pytest.mark.integration
@pytest.mark.parametrize('proof,dated', [
    (_proof(reconciled='true'), True),
    (_proof(reconciled='false'), True),
    (_proof(reconciled=1), True),
    (_proof(reconciled=False), True),
    (_proof(validation_policy='retired-policy'), True),
    (_proof(), False),
    (['not an object certificate'], True),
])
def test_explicit_uncertified_requests_are_rejected(sql_session, proof, dated):
    unverified = _version(sql_session, proof=proof, dated=dated)
    with pytest.raises(HTTPException) as failure:
        active_version(sql_session, unverified.id)
    assert failure.value.status_code == 409
    assert failure.value.detail == 'Dataset version is not certified for publication'


@pytest.mark.integration
def test_default_strictly_rechecks_sql_json_true_candidates(sql_session):
    published = _version(sql_session)
    string_true = _version(sql_session, proof=_proof(reconciled='true'))
    case_variant = _version(sql_session, proof=_proof(validation_policy=VALIDATION_POLICY_VERSION.upper()))
    assert case_variant.id > string_true.id > published.id
    assert active_version(sql_session) == published.id


@pytest.mark.integration
def test_authorized_preview_capability_selects_only_the_requested_version(sql_session):
    unpublished = _version(sql_session, proof={}, dated=False)
    later_unpublished = _version(sql_session, proof={}, dated=False)
    assert later_unpublished.id > unpublished.id
    assert active_version(sql_session, unpublished.id, allow_uncertified=True) == unpublished.id


@pytest.mark.integration
@pytest.mark.parametrize('preview', [False, True])
def test_unknown_explicit_version_keeps_not_found_semantics(sql_session, preview):
    version = _version(sql_session)
    # A negative PK is outside the positive SQL identity sequence; HTTP query
    # validation separately rejects negative parameters at the API boundary.
    with pytest.raises(HTTPException) as failure:
        active_version(sql_session, -version.id, allow_uncertified=preview)
    assert failure.value.status_code == 404


@pytest.mark.integration
def test_monthly_read_uses_the_same_publication_gate(sql_session):
    from app.repositories import monthly_series
    from app.schemas import Filters

    unverified = _version(sql_session, proof={}, dated=False)
    with pytest.raises(HTTPException) as failure:
        monthly_series(sql_session, Filters(indicator='terra_lst_day_c', dataset_version_id=unverified.id))
    assert failure.value.status_code == 409
    points, indicator, version_id = monthly_series(sql_session, Filters(
        indicator='terra_lst_day_c', dataset_version_id=unverified.id, allow_uncertified=True,
    ))
    assert points == []
    assert indicator.id == 'terra_lst_day_c'
    assert version_id == unverified.id
