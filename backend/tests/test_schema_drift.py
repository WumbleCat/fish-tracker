"""The SQL migrations are the source of truth; the SQLAlchemy models are a
hand-kept copy. This test reflects the live schema and fails on drift."""

import sqlalchemy as sa
from sqlalchemy import inspect

from app.models import Base

# Money columns that must be BIGINT — a silent INTEGER would overflow, and
# anything float-adjacent is a bug by definition.
MONEY_COLUMNS = {
    ("entries", "amount_minor"),
    ("games", "stake_minor"),
    ("settlements", "discrepancy_minor"),
    ("adjustments", "amount_minor"),
}


def test_models_match_live_schema(engine):
    inspector = inspect(engine)
    live_tables = set(inspector.get_table_names(schema="public"))

    for table in Base.metadata.tables.values():
        assert table.name in live_tables, f"model table {table.name} missing in database"
        live_cols = {c["name"]: c for c in inspector.get_columns(table.name, schema="public")}

        model_names = {c.name for c in table.columns}
        assert model_names == set(live_cols), (
            f"{table.name}: model columns {sorted(model_names)} != "
            f"database columns {sorted(live_cols)}"
        )

        for col in table.columns:
            live = live_cols[col.name]
            assert col.nullable == live["nullable"], (
                f"{table.name}.{col.name}: model nullable={col.nullable}, "
                f"database nullable={live['nullable']}"
            )

    for table_name, col_name in MONEY_COLUMNS:
        live = {c["name"]: c for c in inspector.get_columns(table_name, schema="public")}
        assert isinstance(live[col_name]["type"], sa.BigInteger), (
            f"{table_name}.{col_name} must be BIGINT, found {live[col_name]['type']}"
        )


def test_live_money_columns_are_never_floats(engine):
    with engine.begin() as conn:
        rows = conn.execute(
            sa.text(
                "select table_name, column_name, data_type "
                "from information_schema.columns "
                "where table_schema = 'public' "
                "  and (column_name like '%minor%' or column_name like '%amount%')"
            )
        ).all()
    assert rows, "expected money columns to exist"
    for table_name, column_name, data_type in rows:
        assert data_type in ("bigint", "integer", "smallint"), (
            f"{table_name}.{column_name} is {data_type}; money must be integral"
        )
