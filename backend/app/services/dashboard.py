"""Share one bounded aggregate scan between the two dashboard projections.

Only published, certified versions use the process cache. Publication
and region validation still run at the route boundary on every request. Cache
keys include database engine, region, source identity and the full certificate;
uncertified previews and connection-bound transactional sessions bypass it.
Cached values are immutable, so responses cannot mutate another caller's data.

The TTL is hours, not seconds, because a certified version is frozen: the key
carries the version sha256, validation timestamp and certificate hash, so any
re-certification or new publication takes a new key rather than serving stale
means. Regional keys stay bounded by max_entries LRU eviction.
"""
from collections import OrderedDict
from dataclasses import dataclass
from hashlib import sha256
import json
from threading import Condition
from time import monotonic

from sqlalchemy import func, select
from sqlalchemy.engine import Engine

from app.models import DatasetVersion, MEASUREMENT_COLUMNS, Observation, SpatialCell
from app.repositories import conditions, is_certified_version
from app.schemas import Filters


@dataclass(frozen=True)
class DashboardAggregate:
    source_rows: int
    means: tuple[float | None, ...]
    present: tuple[int, ...]


class AggregateCache:
    """Bounded TTL cache; concurrent requests for one key share a single load."""

    def __init__(self, ttl=3600, max_entries=32, clock=monotonic):
        self.ttl, self.max_entries, self.clock = ttl, max_entries, clock
        self.entries = OrderedDict()
        self.pending = set()
        self.condition = Condition()

    def get(self, key, load):
        with self.condition:
            while key in self.pending:
                self.condition.wait()
            entry = self.entries.get(key)
            if entry and entry[0] > self.clock():
                self.entries.move_to_end(key)
                return entry[1]
            self.entries.pop(key, None)
            self.pending.add(key)
        try:
            value = load()
        except BaseException:
            with self.condition:
                self.pending.remove(key)
                self.condition.notify_all()
            raise
        with self.condition:
            self.entries[key] = (self.clock() + self.ttl, value)
            while len(self.entries) > self.max_entries:
                self.entries.popitem(last=False)
            self.pending.remove(key)
            self.condition.notify_all()
        return value


aggregate_cache = AggregateCache()


def dashboard_aggregate(session, region_id, version_id, *, allow_cache=True):
    def load():
        row = session.execute(select(
            func.count(Observation.id),
            *(func.avg(getattr(Observation, c)) for c in MEASUREMENT_COLUMNS),
            *(func.count(getattr(Observation, c)) for c in MEASUREMENT_COLUMNS),
        ).join(SpatialCell).where(*conditions(Filters(region_id=region_id), version_id))).one()
        columns = len(MEASUREMENT_COLUMNS)
        return DashboardAggregate(row[0], tuple(row[1:columns + 1]), tuple(row[columns + 1:]))

    bind = session.get_bind()
    version = session.get(DatasetVersion, version_id)
    if (not allow_cache or not isinstance(bind, Engine) or not is_certified_version(version)
            or session.new or session.dirty or session.deleted):
        return load()
    certificate = sha256(json.dumps(version.validation_json, sort_keys=True).encode()).hexdigest()
    key = (bind, version_id, version.sha256, version.validated_at, certificate, region_id)
    return aggregate_cache.get(key, load)
