import json
from typing import Any

import duckdb
import pyarrow.ipc as ipc

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None


SUPPORTED_TYPES = {"csv", "json", "ndjson", "parquet", "arrow"}


def _normalize_json_value(value: Any) -> Any:
    if value is None:
        return None

    if pd is not None:
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        if value is pd.NaT:
            return None

    if np is not None:
        if isinstance(value, np.ndarray):
            return [_normalize_json_value(item) for item in value.tolist()]
        if isinstance(value, np.generic):
            return _normalize_json_value(value.item())

    if isinstance(value, dict):
        return {str(k): _normalize_json_value(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [_normalize_json_value(item) for item in value]

    if hasattr(value, "isoformat") and callable(value.isoformat):
        try:
            return value.isoformat()
        except TypeError:
            pass

    return value


def detect_file_type(file_path: str) -> str:
    with open(file_path, "rb") as f:
        first_bytes = f.read(120)

    if first_bytes.startswith(b"PAR1"):
        return "parquet"

    if first_bytes.startswith(b"\xff\xff\xff\xff"):
        return "arrow"

    stripped = first_bytes.strip()
    if stripped.startswith(b"{") or stripped.startswith(b"["):
        return _distinguish_json_variants(file_path)

    return "csv"


def _distinguish_json_variants(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            first_line = f.readline().strip()
            if not first_line:
                return "json"

            json.loads(first_line)
            second_line = f.readline().strip()
            if second_line:
                try:
                    json.loads(second_line)
                    return "ndjson"
                except json.JSONDecodeError:
                    return "json"
            return "json"
    except (json.JSONDecodeError, UnicodeDecodeError):
        return "json"


def _load_arrow_table(file_path: str):
    with open(file_path, "rb") as f:
        reader = ipc.RecordBatchStreamReader(f)
        return reader.read_all()


def _source_sql(file_type: str, file_path: str) -> tuple[str | None, list[Any]]:
    if file_type == "csv":
        return "SELECT * FROM read_csv_auto(?)", [file_path]
    if file_type == "json":
        return "SELECT * FROM read_json_auto(?)", [file_path]
    if file_type == "ndjson":
        return "SELECT * FROM read_ndjson(?)", [file_path]
    if file_type == "parquet":
        return "SELECT * FROM read_parquet(?)", [file_path]
    if file_type == "arrow":
        return None, [file_path]
    raise ValueError(f"Unsupported file type: {file_type}")


def load_data_table(connection: duckdb.DuckDBPyConnection, file_path: str) -> str:
    file_type = detect_file_type(file_path)
    if file_type not in SUPPORTED_TYPES:
        raise ValueError(f"Unsupported file type: {file_type}")

    connection.execute("DROP TABLE IF EXISTS data")
    if file_type == "arrow":
        connection.register("data", _load_arrow_table(file_path))
    else:
        source_sql, params = _source_sql(file_type, file_path)
        connection.execute(f"CREATE TEMP TABLE data AS {source_sql}", params)

    return file_type


def inspect_data_file(file_path: str) -> dict[str, Any]:
    connection = duckdb.connect(database=":memory:")
    try:
        file_type = load_data_table(connection, file_path)
        schema_rows = connection.execute("DESCRIBE data").fetchall()
        row_count = int(connection.execute("SELECT COUNT(*) FROM data").fetchone()[0])

        schema = [
            {
                "column": row[0],
                "type": row[1],
                "nullable": row[2],
            }
            for row in schema_rows
        ]

        return {
            "file_type": file_type,
            "row_count": row_count,
            "schema": schema,
        }
    finally:
        connection.close()


def execute_query(file_path: str, sql: str, max_rows: int) -> dict[str, Any]:
    connection = duckdb.connect(database=":memory:")
    try:
        file_type = load_data_table(connection, file_path)
        dataframe = connection.execute(sql).fetchdf()

        truncated = len(dataframe) > max_rows
        output_df = dataframe.head(max_rows)

        return {
            "file_type": file_type,
            "columns": list(output_df.columns),
            "rows": [
                {k: _normalize_json_value(v) for k, v in row.items()}
                for row in output_df.to_dict(orient="records")
            ],
            "row_count": int(len(dataframe)),
            "returned_rows": int(len(output_df)),
            "truncated": truncated,
        }
    finally:
        connection.close()
