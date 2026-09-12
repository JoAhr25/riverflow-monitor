import sqlite3
import threading
from pathlib import Path
from typing import Any

from paths import DATA_DIR

MEASUREMENT_COLUMNS = (
    "timestamp TEXT NOT NULL",
    "water_level REAL",
    "lidar_distance REAL",
    "camera_water_edge REAL",
    "flow_rate REAL",
    "surface_velocity REAL",
    "velocity_unit TEXT",
    "calibrated INTEGER",
    "image_motion REAL",
    "motion_x REAL",
    "motion_y REAL",
    "direction_deg REAL",
    "debris_count INTEGER",
    "camera_status TEXT",
    "lidar_status TEXT",
    "lora_status TEXT",
    "source TEXT",
    "camera_fps REAL",
)

MEASUREMENT_KEYS = tuple(c.split()[0] for c in MEASUREMENT_COLUMNS)


class Database:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = Path(db_path) if db_path else DATA_DIR / "riverflow.db"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                f"CREATE TABLE IF NOT EXISTS measurements (id INTEGER PRIMARY KEY AUTOINCREMENT, {', '.join(MEASUREMENT_COLUMNS)})"
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_measurements_ts ON measurements(timestamp)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS validation_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    test_name TEXT,
                    reference_flow_rate REAL,
                    measured_flow_rate REAL,
                    reference_water_level REAL,
                    measured_water_level REAL,
                    reference_debris_count INTEGER,
                    measured_debris_count INTEGER,
                    notes TEXT
                )
                """
            )

    def insert_measurement(self, row: dict[str, Any]) -> None:
        keys = [k for k in MEASUREMENT_KEYS if k in row]
        placeholders = ", ".join("?" for _ in keys)
        columns = ", ".join(keys)
        values = [row[k] for k in keys]
        with self._lock, self._connect() as conn:
            conn.execute(
                f"INSERT INTO measurements ({columns}) VALUES ({placeholders})", values
            )

    def latest_measurement(self) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM measurements ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def get_history(self, since_iso: str | None = None, limit: int = 2000) -> list[dict[str, Any]]:
        query = "SELECT * FROM measurements"
        params: list[Any] = []
        if since_iso:
            query += " WHERE timestamp >= ?"
            params.append(since_iso)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(int(limit))
        with self._lock, self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in reversed(rows)]

    def count_measurements(self) -> int:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS n FROM measurements").fetchone()
        return int(row["n"])

    def is_writable(self) -> bool:
        try:
            with self._lock, self._connect() as conn:
                conn.execute("SELECT 1")
            return True
        except sqlite3.Error:
            return False

    def insert_validation_test(self, row: dict[str, Any]) -> dict[str, Any]:
        columns = (
            "timestamp",
            "test_name",
            "reference_flow_rate",
            "measured_flow_rate",
            "reference_water_level",
            "measured_water_level",
            "reference_debris_count",
            "measured_debris_count",
            "notes",
        )
        values = [row.get(c) for c in columns]
        placeholders = ", ".join("?" for _ in columns)
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                f"INSERT INTO validation_tests ({', '.join(columns)}) VALUES ({placeholders})",
                values,
            )
            new_id = cur.lastrowid
        return {"id": new_id, **{c: row.get(c) for c in columns}}

    def list_validation_tests(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM validation_tests ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

    def delete_validation_test(self, test_id: int) -> bool:
        with self._lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM validation_tests WHERE id = ?", (test_id,))
        return cur.rowcount > 0
