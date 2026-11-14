from sqlalchemy import select

from app.models import DataSource, Dataset, Indicator, MEASUREMENT_COLUMNS, Region

DATASET_ID = 'earthtrend-spatial-fusion-v2'
REGION_ID = 'hurghada-study-area'


def seed_catalog(session):
    if session.get(Region, REGION_ID) is None:
        session.add(Region(id=REGION_ID, name='Hurghada fusion study area', country='Egypt',
                           description='Source grid footprint; not an administrative city boundary.'))
    for source, name in [('terra', 'Terra MODIS source features'), ('aqua', 'Aqua MODIS source features'),
                         ('ghsl', 'GHSL 2020 built surface snapshot')]:
        if session.get(DataSource, source) is None:
            session.add(DataSource(id=source, name=name))
    if session.get(Dataset, DATASET_ID) is None:
        session.add(Dataset(id=DATASET_ID, name='EarthTrend spatial fusion v2',
                            description='Local fusion CSV with eight-day LST, previous-month context and GHSL 2020 snapshot.'))
    session.flush()
    existing = set(session.scalars(select(Indicator.id)))
    for code in MEASUREMENT_COLUMNS:
        if code in existing:
            continue
        support = 'snapshot_2020' if code.startswith('ghsl') else ('previous_month' if 'prev_month' in code else '8_day')
        unit = 'm2' if 'surface_m2' in code else ('pixels' if 'pixel_count' in code else ('index' if 'ndvi' in code or 'evi' in code else 'degC'))
        session.add(Indicator(id=code, name=code.replace('_', ' '), source_id=code.split('_')[0],
                              unit=unit, temporal_support=support,
                              description=f'Original source column {code}; values preserved without rescaling.'))
    session.flush()
