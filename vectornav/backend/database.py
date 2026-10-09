"""
VectorNav — SQLite Database Layer
===================================
Handles all database initialisation and CRUD operations for:
  - gps_data           : raw GPS readings
  - motion_data        : computed velocity / acceleration
  - routes             : route optimisation results
  - navigation_history : aggregated navigation session records
"""

import sqlite3
import os
from datetime import datetime

# Resolve DB path relative to this file → ../database/vectornav.db
_HERE    = os.path.dirname(os.path.abspath(__file__))
_DB_DIR  = os.path.join(_HERE, "..", "database")
DB_PATH  = os.path.join(_DB_DIR, "vectornav.db")


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create all tables if they do not already exist."""
    os.makedirs(_DB_DIR, exist_ok=True)

    with _connect() as conn:
        cur = conn.cursor()

        # GPS readings
        cur.execute("""
            CREATE TABLE IF NOT EXISTS gps_data (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude    REAL    NOT NULL,
                longitude   REAL    NOT NULL,
                altitude    REAL    DEFAULT 0.0,
                accuracy    REAL    DEFAULT 0.0,
                timestamp   TEXT    NOT NULL
            )
        """)

        # Motion calculations
        cur.execute("""
            CREATE TABLE IF NOT EXISTS motion_data (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                velocity_x      REAL DEFAULT 0.0,
                velocity_y      REAL DEFAULT 0.0,
                velocity_z      REAL DEFAULT 0.0,
                speed           REAL DEFAULT 0.0,
                acceleration_x  REAL DEFAULT 0.0,
                acceleration_y  REAL DEFAULT 0.0,
                acceleration_z  REAL DEFAULT 0.0,
                acceleration    REAL DEFAULT 0.0,
                direction       REAL DEFAULT 0.0,
                cardinal        TEXT DEFAULT 'N',
                timestamp       TEXT NOT NULL
            )
        """)

        # Route optimisation results
        cur.execute("""
            CREATE TABLE IF NOT EXISTS routes (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                start_latitude      REAL NOT NULL,
                start_longitude     REAL NOT NULL,
                destination_latitude  REAL NOT NULL,
                destination_longitude REAL NOT NULL,
                distance            REAL DEFAULT 0.0,
                estimated_time      REAL DEFAULT 0.0,
                cost                REAL DEFAULT 0.0,
                selected_route      TEXT DEFAULT 'A',
                created_at          TEXT NOT NULL
            )
        """)

        # Navigation history (aggregated session records)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS navigation_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude    REAL NOT NULL,
                longitude   REAL NOT NULL,
                speed       REAL DEFAULT 0.0,
                acceleration REAL DEFAULT 0.0,
                direction   REAL DEFAULT 0.0,
                accuracy    REAL DEFAULT 0.0,
                altitude    REAL DEFAULT 0.0,
                session_id  TEXT DEFAULT '',
                timestamp   TEXT NOT NULL
            )
        """)

        conn.commit()


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # rows accessible as dicts
    return conn


def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


# ---------------------------------------------------------------------------
# gps_data
# ---------------------------------------------------------------------------

def save_gps_data(lat: float, lon: float, alt: float = 0.0, accuracy: float = 0.0) -> int:
    ts = datetime.utcnow().isoformat()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO gps_data (latitude, longitude, altitude, accuracy, timestamp) "
            "VALUES (?, ?, ?, ?, ?)",
            (lat, lon, alt, accuracy, ts)
        )
        conn.commit()
        return cur.lastrowid


def get_gps_history(limit: int = 100) -> list:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM gps_data ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# motion_data
# ---------------------------------------------------------------------------

def save_motion_data(vx: float, vy: float, vz: float,
                     speed: float,
                     ax: float, ay: float, az: float,
                     acc: float,
                     direction: float, cardinal: str) -> int:
    ts = datetime.utcnow().isoformat()
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO motion_data
               (velocity_x, velocity_y, velocity_z, speed,
                acceleration_x, acceleration_y, acceleration_z, acceleration,
                direction, cardinal, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (vx, vy, vz, speed, ax, ay, az, acc, direction, cardinal, ts)
        )
        conn.commit()
        return cur.lastrowid


def get_motion_history(limit: int = 200) -> list:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM motion_data ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

def save_route(start_lat: float, start_lon: float,
               dest_lat: float,  dest_lon: float,
               distance: float,  est_time: float,
               cost: float, selected: str = "A") -> int:
    ts = datetime.utcnow().isoformat()
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO routes
               (start_latitude, start_longitude, destination_latitude, destination_longitude,
                distance, estimated_time, cost, selected_route, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (start_lat, start_lon, dest_lat, dest_lon, distance, est_time, cost, selected, ts)
        )
        conn.commit()
        return cur.lastrowid


def get_routes(limit: int = 50) -> list:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM routes ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# navigation_history
# ---------------------------------------------------------------------------

def save_nav_record(lat: float, lon: float, speed: float,
                    acc: float, direction: float, accuracy: float,
                    alt: float = 0.0, session_id: str = "") -> int:
    ts = datetime.utcnow().isoformat()
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO navigation_history
               (latitude, longitude, speed, acceleration, direction,
                accuracy, altitude, session_id, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (lat, lon, speed, acc, direction, accuracy, alt, session_id, ts)
        )
        conn.commit()
        return cur.lastrowid


def get_nav_history(limit: int = 200) -> list:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM navigation_history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_nav_record(record_id: int) -> bool:
    with _connect() as conn:
        conn.execute("DELETE FROM navigation_history WHERE id = ?", (record_id,))
        conn.commit()
    return True


def clear_nav_history() -> bool:
    with _connect() as conn:
        conn.execute("DELETE FROM navigation_history")
        conn.commit()
    return True


# ---------------------------------------------------------------------------
# Analytics aggregation
# ---------------------------------------------------------------------------

def get_analytics() -> dict:
    with _connect() as conn:
        nav = conn.execute(
            "SELECT COUNT(*) as cnt, AVG(speed) as avg_spd, MAX(speed) as max_spd, "
            "AVG(acceleration) as avg_acc, MAX(acceleration) as max_acc, "
            "AVG(accuracy) as avg_acc2 FROM navigation_history"
        ).fetchone()
        routes_cnt = conn.execute("SELECT COUNT(*) as cnt FROM routes").fetchone()
        gps_cnt    = conn.execute("SELECT COUNT(*) as cnt FROM gps_data").fetchone()

    return {
        "total_nav_records":  nav["cnt"]      or 0,
        "avg_speed_ms":       round(nav["avg_spd"]  or 0, 3),
        "max_speed_ms":       round(nav["max_spd"]  or 0, 3),
        "avg_acceleration":   round(nav["avg_acc"]  or 0, 3),
        "max_acceleration":   round(nav["max_acc"]  or 0, 3),
        "avg_gps_accuracy":   round(nav["avg_acc2"] or 0, 3),
        "total_routes":       routes_cnt["cnt"] or 0,
        "total_gps_readings": gps_cnt["cnt"]    or 0,
    }
